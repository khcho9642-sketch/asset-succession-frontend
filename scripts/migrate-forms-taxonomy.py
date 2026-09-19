#!/usr/bin/env python3
"""Add resource metadata only after collection is complete; never rewrite legacy fields.

Default is a read-only preview. --apply validates first and stores the complete
pre-migration manifest and byte hashes for rollback/preservation verification.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
import mimetypes
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = Path("public/downloads/official-forms/manifest.json")
DOCS = Path("docs/forms-library-v2")
GROUPS = Path("public/downloads/official-forms/presentation-groups.json")
BASELINE = DOCS / "evidence/pre-migration-manifest.json"
INTEGRITY = DOCS / "evidence/pre-migration-files.json"
RELATION_TYPES = {
    "legal_subform": "subform_of", "example": "example_for",
    "supporting_schedule": "attachment_of", "supporting_form": "attachment_of",
    "guide": "attachment_of", "shared_reference": "attachment_of",
}
EXTRA_PARENTS = {"P1-13": ["G-REG-GIFT", "G-REG-SALE"], "P9-03": ["G-IOU"]}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def public_path(root: Path, url: str | None) -> Path | None:
    if not url or not url.startswith("/downloads/"):
        return None
    path = (root / "public" / unquote(urlparse(url).path).lstrip("/")).resolve()
    if not path.is_relative_to((root / "public/downloads").resolve()):
        raise ValueError(f"Unsafe file path: {url}")
    return path


def preserved_files(root: Path, manifest: dict) -> dict:
    """Include thumbnails, editable/example paths, every file, and the legacy ZIP."""
    urls = set()
    for doc in manifest["documents"]:
        urls.update(doc.get(k) for k in ("editable", "example", "thumbnail") if doc.get(k))
        urls.update(f.get("path") for f in doc.get("files", []) if f.get("path"))
    if manifest.get("bundle", {}).get("path"):
        urls.add(manifest["bundle"]["path"])
    result = {}
    for url in sorted(urls):
        path = public_path(root, url)
        if path:
            if not path.is_file():
                raise ValueError(f"Legacy file is missing: {url}")
            result[url] = {"sha256": digest(path), "bytes": path.stat().st_size}
    return result


def collection_gate(root: Path):
    results = read_json(root / "docs/forms-expansion-109/results.json")
    summary = read_json(root / "docs/forms-expansion-109/summary.json")
    pending = [x["id"] for x in results if x.get("status") != "확인 완료"]
    if len(results) != 109 or len({x["id"] for x in results}) != 109:
        raise ValueError("Collection request ledger must contain exactly 109 unique tasks")
    if pending or summary.get("completed") != 109 or summary.get("unchecked") != 0:
        raise ValueError("Collection must finish before tagging: " + ", ".join(pending))
    if summary.get("failed_original_ids"):
        raise ValueError("Required originals are still missing: " + ", ".join(summary["failed_original_ids"]))


def iso_timestamp(doc: dict) -> str | None:
    value = doc.get("checked_at") or doc.get("checkedOn")
    if not value:
        return None
    # A day-only acquisition record is not invented as a precise verification time.
    # Migration review time is used separately for verification of preserved evidence.
    return value if "T" in value else None


def verification(status: str, refs: list[str], note: str, reviewed_at: str) -> dict:
    value = {"status": status, "evidence_refs": refs, "note": note}
    if status == "verified":
        value.update(reviewed_at=reviewed_at, reviewer_ref="forms-taxonomy-migration:evidence-review")
    return value


def source_verification(doc: dict, task: dict | None, reviewed_at: str) -> dict:
    refs = [f"legacy:{doc['id']}"]
    evidence = doc.get("source_evidence") or (task or {}).get("source_evidence")
    has_binary = bool(doc.get("binaryInspected") and doc.get("sourceVerification"))
    has_evidence = bool(evidence)
    task_original = any(f.get("sha256") and f.get("title_verified") for f in (task or {}).get("files", []))
    done = doc.get("status", "확인 완료") == "확인 완료"
    status = "verified" if done and (has_binary or has_evidence or task_original) else "pending"
    if task:
        refs.append(f"collection:{task['id']}")
    note = (
        "보존된 수집 증거의 출처·파일 확인 상태만 반영. 현행 법률 적용·제출 적합성 검증과 구분."
        if status == "verified" else "수집 완료 표기만으로 출처 검증 완료를 추정하지 않음. 확인 근거 추가 검토 필요."
    )
    if doc.get("provider_origin") == "private_institution" or doc.get("source_type") == "민간제공처":
        note += " 민간 제공기관의 자료이며 발행기관 명칭과 해당 기관의 원문 주소를 보존함."
    return verification(status, refs, note, reviewed_at)


def asset_facets(doc: dict) -> list[str]:
    """Only explicit asset words from title or the institutional file name."""
    title = doc["title"]
    assets = []
    patterns = {
        "real_estate": r"부동산|주택|아파트|연립|집합건물|구분건물|토지|농지|건물|전세|근저당|주택채권",
        "cash_deposit": r"예금|현금|금전|대여금|차용증|금융계좌",
        "securities": r"주식|증권|파생상품|주주|배당금",
        "business": r"가업|창업|사업자|기업",
        "insurance_pension": r"보험|연금|공제금|유족급여|퇴직급여|퇴직연금",
    }
    # 국민주택채권 is itself securities, while its purchase accompanies real-estate registration.
    if "국민주택채권" in title:
        return ["real_estate", "securities"]
    if "건강보험" in title:
        # A health-insurance administrative notice does not establish an inheritable insurance asset.
        return []
    for key, pattern in patterns.items():
        if re.search(pattern, title):
            assets.append(key)
    return assets


def kind_facet(doc: dict, row: dict) -> tuple[str, bool]:
    # A requested title may differ from what the provider actually supplies.
    # Preserve the evidence-backed supplied kind without rewriting the legacy title.
    if doc.get("provider_kind"):
        kind = doc["provider_kind"]
        if kind not in {"form", "guide", "worksheet", "example", "toolkit", "service_link"}:
            raise ValueError(f"Invalid explicit provider kind: {doc['id']}/{kind}")
        return kind, True
    title = doc["title"]
    relation = row.get("relationship") or {}
    if relation.get("type") == "example" or "작성사례" in doc.get("originalCategory", ""):
        return "example", True
    if relation.get("type") == "guide" or re.search(r"안내|작성요령|작성 방법|작성방법", title):
        return "guide", True
    if doc["id"] in {"P1-14", "P1-17"}:
        return "guide", True
    if re.search(r"신청서|신고서|청구서|계약서|동의서|위임장|명세서|명세표|차용증|영수증|확인서|심판청구|소장|조정신청|양식|매매 ·|임대차 ·|금전대차", title):
        return "form", True
    if doc.get("form_no") or any(f.get("role") == "original" for f in doc.get("files", [])):
        return "form", True
    if doc.get("delivery") == "provider":
        return "service_link", False
    return "guide", False


def origin_facet(doc: dict, source: dict) -> str:
    # Collection review may identify a first-party private provider. Preserve that
    # explicit provenance before considering URL suffixes or generic legacy labels.
    if doc.get("provider_origin"):
        origin = doc["provider_origin"]
        if origin not in {"official_institution", "private_institution", "editorial", "unknown"}:
            raise ValueError(f"Invalid explicit provider origin: {doc['id']}/{origin}")
        return origin
    if doc.get("source_type") == "민간제공처":
        return "private_institution"
    if source["status"] != "verified":
        return "unknown"
    host = (urlparse(doc.get("sourceUrl") or "").hostname or "").lower()
    if host.endswith((".go.kr", ".scourt.go.kr")) or host in {"scourt.go.kr", "gov.kr", "law.go.kr"}:
        return "official_institution"
    # Public institutions explicitly identified in the acquisition ledger.
    if host.endswith((".fss.or.kr", ".nps.or.kr", ".nhis.or.kr", ".ksd.or.kr", ".comwel.or.kr")):
        return "official_institution"
    if host.endswith((".kebhana.com", ".shinhan.com", ".kbstar.com", ".knia.or.kr", ".klia.or.kr")):
        return "private_institution"
    return "unknown"


def file_metadata(root: Path, doc: dict, revision_id: str) -> list[dict]:
    result = []
    for file in doc.get("files", []):
        # Generated PDFs remain in legacy files, but must not become institutional originals.
        if str(file.get("artifactType", "")).startswith("derived") or file.get("role") == "image-compilation":
            continue
        path = public_path(root, file.get("path"))
        if not path or not path.is_file():
            continue
        sha = digest(path)
        if file.get("sha256") and file["sha256"] != sha:
            raise ValueError(f"File hash mismatch: {doc['id']} {file['path']}")
        fid = f"file:{doc['id']}:{len(result) + 1}:{sha[:12]}"
        mime = {"HWP": "application/x-hwp", "HWPX": "application/vnd.hancom.hwpx"}.get(str(file.get("format", "")).upper())
        result.append({"file_id": fid, "original_filename": file.get("originalFilename") or file.get("name") or path.name,
                       "media_type": mime or mimetypes.guess_type(path.name)[0] or "application/octet-stream",
                       "storage_ref": file["path"], "sha256": sha,
                       "source_revision_ref": revision_id, "immutable": True})
    return result


def relations_for(row: dict, reviewed_at: str) -> list[dict]:
    rid = row["id"]
    refs = [f"taxonomy:{rid}"]
    raw = row.get("relationship")
    pairs = []
    if row.get("presentation_group_id"):
        pairs.append(("ui_member_of", row["presentation_group_id"], "화면 탐색 묶음. 독립된 절차와 원본은 유지."))
    if raw:
        targets = [raw["target_id"], *EXTRA_PARENTS.get(rid, [])]
        rel_type = "subform_of" if rid == "P0-09" else RELATION_TYPES[raw["type"]]
        pairs += [(rel_type, target, raw["reason"]) for target in targets]
    out = []
    for rel_type, target, note in pairs:
        legal = rel_type == "subform_of"
        evidence = refs + ([f"legacy:{rid}", f"legacy:{target}"] if legal else [])
        relation = {"type": rel_type, "target_resource_id": target,
                    "evidence_refs": evidence, "note": note,
                    "verification": verification("verified", evidence,
                        "승인된 배치표의 화면 연결을 적용. 법적 적용조건은 별도 미검증." if not legal else
                        "배치표와 보존 수집 증거의 본서식·부표 연결 확인. 개인별 제출 의무 판단은 포함하지 않음.", reviewed_at)}
        if legal:
            relation["procedure_id"] = f"procedure:{target}"
        out.append(relation)
    return out


def planning_windows(doc: dict, row: dict, reviewed_at: str) -> list[dict]:
    if doc["id"] != "P8-09":
        return []
    return [{"window_id": "P8-09:contract-preparation", "type": "capacity",
             "label": "후견계약 준비 가능 조건 확인", "availability_conditions": ["계약 준비 조건과 감독인 선임 등 효력 발생 조건을 구분해 전문가에게 확인"],
             "closing_events": ["의사결정 능력이나 보호 필요 상황이 달라지는 경우"],
             "purposes": row["purpose_ids"], "party_roles": [], "evidence_refs": ["taxonomy:P8-09"],
             "verification": verification("needs_review", ["taxonomy:P8-09"], "정성적 상담 검토 항목. 법률 원문·개별 적용 조건 미검증이며 능력·자격이나 마감을 판정하지 않음.", reviewed_at),
             "display_policy": "qualitative_only", "impact": "option_availability"}]


def apply_supplemental_source_verification(root: Path, doc: dict, resource: dict) -> dict:
    """Return a new resource only; preserve legacy data and earlier source revisions."""
    entries = [entry for entry in load_validator().supplemental_sources(root).values() if entry["resource_id"] == doc["id"]]
    if not entries:
        return resource
    updated = copy.deepcopy(resource)
    for entry in entries:
        if entry["source_url"] != doc.get("sourceUrl"):
            raise ValueError(f"Supplemental proof points to a different source: {doc['id']}")
        if doc.get("provider_origin") and doc["provider_origin"] != entry["origin"]:
            raise ValueError(f"Supplemental origin conflicts with collection provenance: {doc['id']}")
        eid = entry["evidence_id"]
        verified = verification("verified", [eid], entry["note"], entry["observed_at"])
        revision = {"source_id": f"source:{doc['id']}", "revision_id": "revision:" + eid,
                    "issuer_name": entry["issuer_name"], "source_url": entry["source_url"],
                    "retrieved_at": entry["observed_at"], "original_files": [], "verification": verified}
        prior = next((r for r in updated["source_revisions"] if r["revision_id"] == revision["revision_id"]), None)
        if prior is not None and prior != revision:
            raise ValueError(f"Immutable supplemental revision changed: {eid}")
        if prior is None:
            updated["source_revisions"].append(revision)
        updated["source_verification"] = verified
        updated["facets"]["origin"] = entry["origin"]
    return updated


def build_resource(root: Path, doc: dict, row: dict, tasks: dict, reviewed_at: str) -> dict:
    rid = doc["id"]
    source = source_verification(doc, tasks.get(doc.get("task_id") or rid), reviewed_at)
    revision_id = f"revision:{rid}:preserved-acquisition"
    files = file_metadata(root, doc, revision_id)
    kind, kind_supported = kind_facet(doc, row)
    assets = asset_facets(doc)
    url = doc.get("sourceUrl")
    delivery = "hosted" if files and doc.get("delivery") == "hosted" else "official_link" if url and doc.get("delivery") != "pending" else "unavailable"
    access = {"hosted_file_ids": [f["file_id"] for f in files]}
    if url:
        access["official_url"] = url
    revisions = []
    if url:
        revision = {"source_id": f"source:{rid}", "revision_id": revision_id,
                    "issuer_name": doc.get("institution") or "제공기관 확인 필요", "source_url": url,
                    "original_files": files, "verification": source}
        if iso_timestamp(doc):
            revision["retrieved_at"] = iso_timestamp(doc)
        revisions.append(revision)
    disposition = row["presentation_disposition"]
    visibility = {"standalone": "standalone", "archive": "archived", "group_member": "within_parent", "child_resource": "within_parent"}[disposition]
    notes = [row["classification_basis"], row["timing_review"], "탐색용 분류이며 법률상 적용·제출 요건은 확인 필요."]
    if not assets:
        notes.append("자산 범위가 제목에 명시되지 않아 빈 배열로 유지.")
    if not kind_supported:
        notes.append("자료 유형은 현재 제공 형태에 따른 임시값으로 내용 검토 필요.")
    authority = "unknown"
    if doc.get("provider_authority"):
        authority = doc["provider_authority"]
        if authority not in {"statutory", "official_reference", "private_terms", "editorial", "unknown"}:
            raise ValueError(f"Invalid explicit provider authority: {rid}/{authority}")
    elif source["status"] == "verified" and (doc.get("licenseBasis") == "statutory-form" or any(f.get("licenseBasis") == "statutory-form" for f in doc.get("files", []))):
        authority = "statutory"
    refs = [f"taxonomy:{rid}", f"legacy:{rid}"]
    relation = row.get("relationship") or {}
    if relation.get("type") == "legal_subform" or rid == "P0-09":
        procedures = [f"procedure:{relation['target_id']}"]
    else:
        # Guides, examples and navigation links are not independent filing procedures.
        procedures = [f"procedure:{rid}"] if kind == "form" else []
    resource = {"schema_version": "1.0.0", "resource_id": rid, "title": doc["title"], "catalog_role": "resource",
            "primary_stage_id": row["primary_stage_id"], "stage_ids": row["stage_ids"],
            "facets": {"purposes": row["purpose_ids"], "timing": row["timing_ids"], "assets": assets,
                       "kind": kind, "origin": origin_facet(doc, source), "authority": authority, "delivery": delivery},
            "applicability": [{"purposes": row["purpose_ids"], "party_roles": [],
                               "condition_description": "목적별 당사자 역할·거래 원인·적용 조건을 개별 확인해야 함.",
                               "evidence_refs": refs, "verification": verification("pending", refs, "탐색 태그를 법적 적용 판정으로 사용하지 않음.", reviewed_at)}],
            "procedure_ids": procedures,
            "classification": {"status": "needs_review", "evidence_refs": refs, "note": " ".join(notes)},
            "source_verification": source, "source_revisions": revisions, "access": access,
            "relations": relations_for(row, reviewed_at),
            "presentation": {"visibility": visibility, "reason": f"승인 배치표: {disposition}. 원본·기존 ID·파일·URL 유지."},
            "deadline": {"state": "unknown", "rule_bindings": [], "evidence_refs": []},
            "planning_windows": planning_windows(doc, row, reviewed_at),
            "legacy_refs": [{"system": "official-forms-manifest", "legacy_id": rid,
                             "legacy_labels": list(dict.fromkeys(x for x in [doc.get("category"), doc.get("originalCategory")] if x))}]}
    return apply_supplemental_source_verification(root, doc, resource)


def build(root: Path, manifest: dict, reviewed_at: str) -> tuple[dict, list[dict]]:
    mapping = read_json(root / DOCS / "taxonomy/resource-mapping.json")
    rows = {x["id"]: x for x in mapping["canonical_resources"]}
    tasks = {x["id"]: x for x in read_json(root / "docs/forms-expansion-109/results.json")}
    result = copy.deepcopy(manifest)
    if {x["id"] for x in result["documents"]} != set(rows):
        raise ValueError("Manifest canonical IDs differ from the approved 177-record mapping")
    for doc in result["documents"]:
        if "resource" in doc:
            raise ValueError("Resource metadata already exists. Validate it instead of overwriting.")
        doc["resource"] = build_resource(root, doc, rows[doc["id"]], tasks, reviewed_at)
    by_id = {x["id"]: x["resource"] for x in result["documents"]}
    groups = read_json(root / DOCS / "taxonomy/presentation-groups.json")
    for group in groups:
        rid = group["id"]
        members = [by_id[i] for i in group["member_resource_ids"]]
        union = lambda key: list(dict.fromkeys(value for m in members for value in m["facets"][key]))
        group["resource"] = {"schema_version": "1.0.0", "resource_id": rid, "title": group["title"],
            "catalog_role": "navigation_group", "primary_stage_id": group["primary_stage_id"],
            "stage_ids": list(dict.fromkeys([group["primary_stage_id"], *[s for m in members for s in m["stage_ids"]]])),
            "facets": {"purposes": union("purposes"), "timing": union("timing"), "assets": union("assets"),
                       "kind": "toolkit", "origin": "editorial", "authority": "editorial", "delivery": "inline"},
            "applicability": [], "procedure_ids": list(dict.fromkeys(p for m in members for p in m["procedure_ids"])),
            "classification": {"status": "reviewed", "evidence_refs": [f"taxonomy:{rid}"], "note": "화면 묶음의 편집 분류. 필터 일치 여부는 자식 자료에서 판정."},
            "source_verification": verification("verified", [f"taxonomy:{rid}"], "승인된 탐색 묶음 정의의 로컬 데이터 검증. 기관 서식 아님.", reviewed_at),
            "source_revisions": [], "access": {"hosted_file_ids": [], "inline_content_ref": f"forms-group:{rid}"},
            "relations": [], "presentation": {"visibility": "standalone"},
            "deadline": {"state": "unknown", "rule_bindings": [], "evidence_refs": []},
            "planning_windows": [], "legacy_refs": []}
    return result, groups


def load_validator():
    spec = importlib.util.spec_from_file_location("forms_taxonomy_validator", Path(__file__).with_name("validate-forms-taxonomy.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--apply", action="store_true", help="Persist only after collection and all checks pass")
    args = parser.parse_args()
    root = args.root.resolve()
    collection_gate(root)
    before = read_json(root / MANIFEST)
    integrity = preserved_files(root, before)
    after, groups = build(root, before, datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    report = load_validator().validate(root, after, groups, before, integrity)
    if args.apply:
        if (root / BASELINE).exists() or (root / INTEGRITY).exists():
            raise ValueError("Migration baseline already exists; refusing to replace preservation evidence")
        write_json(root / BASELINE, before)
        write_json(root / INTEGRITY, integrity)
        write_json(root / MANIFEST, after)
        write_json(root / GROUPS, groups)
        write_json(root / DOCS / "evidence/migration-validation.json", report)
    print(json.dumps({"applied": args.apply, **report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
