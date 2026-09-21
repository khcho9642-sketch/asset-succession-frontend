#!/usr/bin/env python3
"""Validate additive taxonomy, immutable legacy data, exact counts, and relationships."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import struct
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
DOCS = Path("docs/forms-library-v2")
MANIFEST = Path("public/downloads/official-forms/manifest.json")
GROUPS = Path("public/downloads/official-forms/presentation-groups.json")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def supplemental_sources(root: Path) -> dict:
    """Read immutable additional evidence without changing the legacy acquisition ledger."""
    path = root / DOCS / "evidence/supplemental-source-verification.json"
    if not path.exists():
        return {}
    registry = read_json(path)
    require(registry.get("schema_version") == "1.0.0", "Unsupported supplemental evidence registry")
    out = {}
    for entry in registry.get("entries", []):
        eid = entry.get("evidence_id", "")
        require(re.fullmatch(r"supplemental:[A-Za-z0-9._:/-]+", eid), "Invalid supplemental evidence ID")
        require(eid not in out, f"Duplicate supplemental evidence ID: {eid}")
        require(entry.get("status") == "verified", f"Unreviewed supplemental evidence cannot elevate source verification: {eid}")
        require(entry.get("original_download_verified") is False and entry.get("legal_applicability_verified") is False,
                f"Supplemental page identity must not claim original/legal verification: {eid}")
        file = (root / entry["evidence_file"]).resolve()
        require(file.is_relative_to((root / DOCS / "evidence").resolve()) and file.is_file(), f"Missing supplemental evidence: {eid}")
        require(sha256(file) == entry.get("evidence_sha256"), f"Supplemental evidence changed: {eid}")
        body = file.read_text(encoding="utf-8")
        terms = entry.get("required_text", [])
        require(len(terms) >= 2 and all(isinstance(term, str) and term and term in body for term in terms), f"Supplemental title/form proof missing: {eid}")
        require(entry.get("observed_title") in terms and entry.get("source_url") in body, f"Supplemental URL/title mismatch: {eid}")
        require(entry.get("origin") in {"official_institution", "private_institution"} and entry.get("issuer_name"), f"Supplemental provider missing: {eid}")
        out[eid] = entry
    return out


def field_state(record, key):
    return {"present": key in record, **({"value": record[key]} if key in record else {})}


def production_overlays(root, baseline, integrity):
    """Apply only reviewed before/after values; never weaken or rewrite the baseline."""
    path = root / DOCS / "evidence/production-overlays.json"
    expected, files = copy.deepcopy(baseline), copy.deepcopy(integrity)
    if not path.exists():
        return expected, files, None
    overlay = read_json(path)
    require(overlay.get("schema_version") == "1.0.0", "Unsupported production overlay")
    for name, field in (("pre-migration-manifest.json", "baseline_manifest_sha256"),
                        ("pre-migration-files.json", "baseline_files_sha256")):
        frozen = root / DOCS / "evidence" / name
        require(sha256(frozen) == overlay.get(field), f"Frozen migration evidence changed: {name}")
    require(baseline == read_json(root / DOCS / "evidence/pre-migration-manifest.json"), "Overlay baseline differs from frozen evidence")
    require(integrity == read_json(root / DOCS / "evidence/pre-migration-files.json"), "Overlay integrity differs from frozen evidence")
    collection_ids = {"P0-10", "P1-02", "P1-03", "P1-04", "P1-05"}
    require(set(overlay.get("collection_ids", [])) == collection_ids, "Unexpected collection overlay scope")
    seen, preview_ids, collection_fields = set(), set(), Counter()
    for change in overlay.get("manifest_overrides", []):
        collection, rid, fields = change["collection"], change["id"], change["fields"]
        require(collection in {"documents", "additionRequests"}, "Unsupported overlay collection")
        require((collection, rid) not in seen and fields, f"Duplicate/empty overlay: {collection}/{rid}")
        seen.add((collection, rid))
        record = next((x for x in expected[collection] if x["id"] == rid), None)
        require(record is not None, f"Overlay cannot add or remove a resource: {rid}")
        if collection == "documents":
            allowed = {"thumbnail", "preview"}
            if rid in {"P0-10", "P1-02"}:
                allowed.add("source_evidence")
            if "preview" in fields or "thumbnail" in fields:
                require({"preview", "thumbnail"} <= set(fields), f"Incomplete preview overlay: {rid}")
                preview_ids.add(rid)
        else:
            require(rid in collection_ids, f"Unapproved collection task overlay: {rid}")
            allowed = {"source_evidence", "guide_file", "integration_evidence"}
            require(set(fields) == allowed, f"Incomplete collection evidence overlay: {rid}")
            collection_fields.update(fields.keys())
        require(set(fields) <= allowed, f"Unapproved legacy field overlay: {rid}/{set(fields) - allowed}")
        for key, values in fields.items():
            require(field_state(record, key) == values["before"], f"Overlay before-value mismatch: {rid}/{key}")
            require(values["after"].get("present") is True, f"Overlay cannot delete fields: {rid}/{key}")
            record[key] = copy.deepcopy(values["after"]["value"])
    require(len(preview_ids) == 74, "Expected exactly 74 explicit preview overlays")
    require(collection_fields == {"source_evidence": 5, "guide_file": 5, "integration_evidence": 5}, "Expected exactly five collection overlays")
    replacements = overlay.get("file_replacements", [])
    require(len(replacements) == 1, "Only the latest service ZIP may replace baseline bytes")
    replacement = replacements[0]
    url = replacement["url"]
    require(url == baseline["bundle"]["path"] and url.endswith("/official-forms.zip"), "Only the bundle ZIP replacement is approved")
    require(files.get(url) == replacement["before"], "ZIP before-hash mismatch")
    files[url] = replacement["after"]
    for relative, receipt in overlay.get("integration_files", {}).items():
        file = (root / relative).resolve()
        require(file.is_relative_to((root / "docs/forms-expansion-109").resolve()) and file.is_file(), f"Integration evidence missing: {relative}")
        require(file.stat().st_size == receipt["bytes"] and sha256(file) == receipt["sha256"], f"Integration evidence changed: {relative}")
    tasks = {x["id"]: x for x in read_json(root / "docs/forms-expansion-109/results.json")}
    for record in expected["additionRequests"]:
        if record["id"] in collection_ids:
            for key in ("source_evidence", "guide_file", "integration_evidence"):
                require(tasks[record["id"]].get(key) == record[key], f"Result/manifest integration mismatch: {record['id']}/{key}")
            for key in ("guide_file", "integration_evidence"):
                require(record[key] in overlay["integration_files"], f"Unpinned integration file: {record['id']}/{key}")
            for prefix in ("", "support_"):
                evidence = record["source_evidence"]
                receipt = overlay["integration_files"].get(evidence[prefix + "evidence_file"], {})
                require(receipt.get("sha256") == evidence[prefix + "evidence_sha256"], f"Integration evidence hash reference mismatch: {record['id']}")
    docs = {x["id"]: x for x in expected["documents"]}
    receipts = overlay.get("preview_files", [])
    require(len(receipts) == 74 and {x["resource_id"] for x in receipts} == preview_ids, "Preview receipt ID set mismatch")
    for receipt in receipts:
        rid = receipt["resource_id"]
        doc, url = docs[rid], receipt["url"]
        preview = doc["preview"]
        require(url == doc["thumbnail"] == f"/downloads/official-forms/previews/{rid}.png", f"Preview path mismatch: {rid}")
        require(preview["sha256"] == receipt["sha256"] and preview["bytes"] == receipt["bytes"], f"Preview metadata mismatch: {rid}")
        source = receipt["source_url"]
        require(source == preview["sourcePath"] and receipt["source_sha256"] == preview["sourceSha256"], f"Preview source mismatch: {rid}")
        require(source in {f.get("path") for f in doc.get("files", [])}, f"Preview source does not belong to resource: {rid}")
        require(source in integrity and integrity[source]["sha256"] == receipt["source_sha256"], f"Preview source original is not preserved: {rid}")
        file = (root / "public" / url.lstrip("/")).resolve()
        require(file.is_relative_to((root / "public/downloads/official-forms/previews").resolve()) and file.is_file(), f"Missing PNG preview: {rid}")
        require(file.stat().st_size == receipt["bytes"] and sha256(file) == receipt["sha256"], f"PNG preview bytes changed: {rid}")
        header = file.read_bytes()[:24]
        require(header[:8] == b"\x89PNG\r\n\x1a\n" and len(header) == 24, f"Invalid PNG preview: {rid}")
        require(struct.unpack(">II", header[16:24]) == (preview["width"], preview["height"]), f"PNG dimensions differ: {rid}")
    return expected, files, overlay


def check_preservation(root, manifest, baseline, integrity):
    expected, expected_files, overlay = production_overlays(root, baseline, integrity)
    stripped = copy.deepcopy(manifest)
    for doc in stripped["documents"]:
        doc.pop("resource", None)
    require(stripped == expected, "Existing manifest fields changed outside resource metadata and explicit production overlays")
    require(all("resource" not in x for x in baseline["documents"]), "Baseline already contains taxonomy")
    for url, expected in expected_files.items():
        path = (root / "public" / unquote(urlparse(url).path).lstrip("/")).resolve()
        require(path.is_relative_to((root / "public/downloads").resolve()), f"Unsafe integrity path: {url}")
        require(path.is_file(), f"Legacy original/preview/ZIP missing: {url}")
        require(path.stat().st_size == expected["bytes"] and sha256(path) == expected["sha256"], f"Legacy file changed: {url}")
    return {"legacy_manifest_fields_unchanged": overlay is None, "legacy_files_and_zip_unchanged": overlay is None,
            "legacy_manifest_core_preserved": True, "legacy_original_files_unchanged": True,
            "preview_overlay_verified": 74 if overlay else 0, "collection_overlay_verified": 5 if overlay else 0,
            "latest_service_zip_verified": overlay is not None, "migration_baselines_unchanged": True}


def validate(root: Path, manifest: dict, groups: list, baseline: dict, integrity: dict) -> dict:
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError as exc:
        raise RuntimeError("Install jsonschema before migration: python -m pip install jsonschema") from exc
    schema = read_json(root / DOCS / "schema/resource.schema.json")
    Draft202012Validator.check_schema(schema)
    Draft202012Validator.check_schema(read_json(root / DOCS / "schema/deadline-case.schema.json"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    mapping = read_json(root / DOCS / "taxonomy/resource-mapping.json")
    rows = {x["id"]: x for x in mapping["canonical_resources"]}
    docs = {x["id"]: x for x in manifest["documents"]}
    require(len(docs) == len(manifest["documents"]) == len(rows) == 177, "Expected 177 unique canonical resources")
    require(set(docs) == set(rows), "Canonical ID set differs from approved mapping")
    group_ids = {x["id"] for x in groups}
    require(len(group_ids) == len(groups) == 19, "Expected 19 separate navigation groups")
    require(not (set(docs) & group_ids), "Canonical and group IDs overlap")
    preservation = check_preservation(root, manifest, baseline, integrity)
    resource_list = [x["resource"] for x in manifest["documents"]] + [x["resource"] for x in groups]
    all_resources = {x["resource_id"]: x for x in resource_list}
    require(len(all_resources) == 196, "Resource IDs must be unique across original records and groups")
    task_ids = {x["id"] for x in read_json(root / "docs/forms-expansion-109/results.json")}
    supplemental = supplemental_sources(root)
    evidence_registry = ({f"legacy:{i}" for i in docs} | {f"collection:{i}" for i in task_ids}
                         | {f"taxonomy:{i}" for i in set(rows) | group_ids} | set(supplemental))
    for entry in supplemental.values():
        require(entry["resource_id"] in docs, f"Supplemental resource does not exist: {entry['resource_id']}")
        require(entry["source_url"] == docs[entry["resource_id"]].get("sourceUrl"), f"Supplemental evidence must verify the preserved source URL: {entry['resource_id']}")

    def check_evidence_refs(value, rid):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "evidence_refs":
                    require(set(child) <= evidence_registry, f"Unresolved evidence reference: {rid}/{child}")
                else:
                    check_evidence_refs(child, rid)
        elif isinstance(value, list):
            for child in value:
                check_evidence_refs(child, rid)

    stage_counts = Counter()
    counts = Counter()
    adjacency = {}
    original_files = 0
    for rid, resource in all_resources.items():
        errors = sorted(validator.iter_errors(resource), key=lambda e: str(list(e.path)))
        require(not errors, f"Schema {rid}: " + "; ".join(f"{list(e.path)} {e.message}" for e in errors[:5]))
        check_evidence_refs(resource, rid)
        require(resource["primary_stage_id"] in resource["stage_ids"], f"Primary stage missing from stages: {rid}")
        if rid in docs:
            require(resource["catalog_role"] == "resource", f"Canonical resource role changed: {rid}")
            require(resource["resource_id"] == docs[rid]["id"] and resource["title"] == docs[rid]["title"], f"Legacy identity mismatch: {rid}")
            row = rows[rid]
            require(resource["stage_ids"] == row["stage_ids"] and resource["primary_stage_id"] == row["primary_stage_id"], f"Stage mapping mismatch: {rid}")
            require(resource["facets"]["purposes"] == row["purpose_ids"] and resource["facets"]["timing"] == row["timing_ids"], f"Facet mapping mismatch: {rid}")
            for legacy_key, facet_key in (("provider_origin", "origin"), ("provider_authority", "authority"), ("provider_kind", "kind")):
                if docs[rid].get(legacy_key):
                    require(resource["facets"][facet_key] == docs[rid][legacy_key], f"Explicit provider provenance lost: {rid}/{legacy_key}")
            if docs[rid].get("source_type") == "민간제공처":
                require(resource["facets"]["origin"] == "private_institution", f"Private provider classified as public: {rid}")
            for revision in resource["source_revisions"]:
                additional = [supplemental[ref] for ref in revision["verification"]["evidence_refs"] if ref in supplemental]
                if additional:
                    require(all(entry["resource_id"] == rid and revision["issuer_name"] == entry["issuer_name"]
                                and revision.get("retrieved_at") == entry["observed_at"] for entry in additional), f"Supplemental source revision mismatch: {rid}")
                    require(not revision["original_files"], f"Page identity proof cannot add original files: {rid}")
                else:
                    require(revision["issuer_name"] == (docs[rid].get("institution") or "제공기관 확인 필요"), f"Institution name changed: {rid}")
                require(revision["source_url"] == docs[rid].get("sourceUrl"), f"Provider source URL changed: {rid}")
            stage_counts[resource["primary_stage_id"]] += 1
            counts[resource["presentation"]["visibility"]] += 1
            require(all(a["verification"]["status"] != "verified" for a in resource["applicability"]), f"Unreviewed legal applicability marked verified: {rid}")
        else:
            require(resource["catalog_role"] == "navigation_group", f"Invalid navigation group role: {rid}")
        require(resource["deadline"] == {"state": "unknown", "rule_bindings": [], "evidence_refs": []}, f"Unverified deadline rule introduced: {rid}")
        require(all(w["display_policy"] == "qualitative_only" and w["verification"]["status"] != "verified" for w in resource["planning_windows"]), f"Unverified planning window exposed as certain: {rid}")
        require(len({w["window_id"] for w in resource["planning_windows"]}) == len(resource["planning_windows"]), f"Duplicate planning window IDs: {rid}")
        adjacency[rid] = []
        relations = resource["relations"]
        if resource["presentation"]["visibility"] == "within_parent":
            require(relations and all(r["verification"]["status"] == "verified" for r in relations), f"Hidden resource lacks verified parent: {rid}")
        for relation in relations:
            target = relation["target_resource_id"]
            require(target in all_resources and target != rid, f"Broken/self parent: {rid} -> {target}")
            if relation["type"] != "equivalent_to":
                adjacency[rid].append(target)
            if relation["type"] == "ui_member_of":
                require(target in group_ids, f"UI membership target is not a navigation group: {rid}")
            if relation["type"] == "subform_of":
                require(target in docs, f"Subform attached to virtual navigation group: {rid}")
                require(relation.get("procedure_id") in all_resources[target]["procedure_ids"], f"Subform procedure reference broken: {rid}")
                require(rid == "P0-09" or rows[rid].get("relationship", {}).get("type") == "legal_subform", f"Reference or case promoted to legal subform: {rid}")
                # Check the retained institution evidence for combined originals or statutory file naming.
                doc = docs[rid]
                filenames = " ".join(f.get("name", "") for f in doc.get("files", []))
                evidence = doc.get("source_evidence") or {}
                same_file = bool({f.get("path") for f in doc.get("files", [])} & {f.get("path") for f in docs[target].get("files", [])})
                matching_annex = evidence.get("matched_annex_titles") or evidence.get("matched_terms") or evidence.get("legacy_id") == target
                require("부표" in filenames or (same_file and evidence) or (rid == "P0-09" and matching_annex and evidence.get("evidence_file")), f"Subform evidence unresolved: {rid}")
                if evidence.get("evidence_file"):
                    require((root / evidence["evidence_file"]).is_file(), f"Retained subform evidence missing: {rid}")
            if (rows.get(rid, {}).get("relationship") or {}).get("type") == "example":
                require(relation["type"] == "example_for", f"Case lost its example relationship: {rid}")
        file_ids = set()
        revision_ids = {r["revision_id"] for r in resource["source_revisions"]}
        for revision in resource["source_revisions"]:
            for file in revision["original_files"]:
                require(file["source_revision_ref"] in revision_ids, f"Unknown source revision: {rid}")
                require(file["file_id"] not in file_ids, f"Duplicate file ID: {rid}")
                file_ids.add(file["file_id"])
                url = file["storage_ref"]
                require(url in integrity and integrity[url]["sha256"] == file["sha256"], f"Original file not preserved: {rid}/{url}")
                original_files += 1
        require(set(resource["access"]["hosted_file_ids"]) <= file_ids, f"Hosted file IDs are unresolved: {rid}")

    visiting, visited = set(), set()

    def visit(rid):
        require(rid not in visiting, f"Parent relationship cycle at {rid}")
        if rid in visited:
            return
        visiting.add(rid)
        for target in adjacency[rid]:
            visit(target)
        visiting.remove(rid)
        visited.add(rid)

    for rid in adjacency:
        visit(rid)
    expected = {"S1": 10, "S2": 1, "S3": 50, "S4": 33, "S5": 55, "S6": 12, "S7": 16}
    require(dict(stage_counts) == expected, f"Stage counts changed: {dict(stage_counts)}")
    require(counts == {"standalone": 84, "within_parent": 84, "archived": 9}, f"Presentation counts changed: {dict(counts)}")
    grouped_members = []
    for group in groups:
        members = group["member_resource_ids"]
        require(all(i in docs for i in members), f"Missing group member: {group['id']}")
        actual = [i for i, resource in all_resources.items() if any(r["type"] == "ui_member_of" and r["target_resource_id"] == group["id"] for r in resource["relations"])]
        require(set(actual) == set(members), f"Group membership differs from approved mapping: {group['id']}")
        grouped_members.extend(members)
    require(len(grouped_members) == len(set(grouped_members)) == 62, "Expected 62 grouped resources without duplication")
    child_ids = [i for i, row in rows.items() if row["presentation_disposition"] == "child_resource"]
    require(len(child_ids) == 22, "Expected 22 child resources")
    formal = sum(any(r["type"] == "subform_of" for r in docs[i]["resource"]["relations"]) for i in child_ids)
    require(formal == 9, "Expected nine formal/combined schedules and 13 cases/reference materials")
    for rid, expected_parents in {"P1-13": {"G-REG-INHERIT", "G-REG-GIFT", "G-REG-SALE"}, "P9-03": {"G-LOAN", "G-IOU"}}.items():
        require({r["target_resource_id"] for r in docs[rid]["resource"]["relations"]} == expected_parents, f"Shared reference lost a parent: {rid}")
    navigation = read_json(root / DOCS / "taxonomy/catalog-navigation.json")
    require(navigation["default_entry"]["context_id"] == "all" and navigation["default_entry"]["stage_id"] is None, "Direct entry must show all resources")
    require(navigation["explicit_navigation"]["reset_action"] == "reset_to_all", "Reset must clear all filters")
    return {"schema_validated_resources": 177, "schema_validated_navigation_groups": 19,
            "canonical_resources": 177, "representative_cards": counts["standalone"] + len(groups),
            "standalone_resources": counts["standalone"], "archived_resources": counts["archived"],
            "group_members": 62, "child_resources": 22, "formal_or_combined_schedules": formal,
            "other_children": len(child_ids) - formal, "stage_counts": dict(stage_counts),
            "preserved_file_urls": len(integrity), "original_file_references": original_files,
            **preservation,
            "classification_needs_review": sum(d["resource"]["classification"]["status"] == "needs_review" for d in docs.values()),
            "source_verification_counts": dict(Counter(d["resource"]["source_verification"]["status"] for d in docs.values())),
            "legal_applicability_pending": True, "deadline_rules_activated": 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    root = args.root.resolve()
    report = validate(root, read_json(root / MANIFEST), read_json(root / GROUPS),
                      read_json(root / DOCS / "evidence/pre-migration-manifest.json"),
                      read_json(root / DOCS / "evidence/pre-migration-files.json"))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
