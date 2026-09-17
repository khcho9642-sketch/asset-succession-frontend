"""Extract institutional previews without modifying any download document.

Install PyMuPDF, Pillow and olefile. HWP embedded previews keep their native
resolution; they are not a verification of the full HWP rendering.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import io
import json
from pathlib import Path
from urllib.parse import unquote

import fitz
import olefile
from PIL import Image, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "public/downloads/official-forms"
OUTPUT = LIBRARY / "previews"
PROOF = ROOT / ".tmp/forms-library-proof"


def source_path(url):
    path = (ROOT / "public" / unquote(url).lstrip("/")).resolve()
    assert path.is_relative_to(LIBRARY.resolve()), url
    return path


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def verify_originals(documents):
    for document in documents:
        for file in document["files"]:
            data = source_path(file["path"]).read_bytes()
            assert len(data) == file["bytes"], file["path"]
            assert sha256(data) == file["sha256"], file["path"]


def main():
    manifest_path = LIBRARY / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    documents = manifest["documents"]
    verify_originals(documents)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    PROOF.mkdir(parents=True, exist_ok=True)
    checks = []
    for record in documents:
        files = record["files"]
        # Prefer the published PDF; use a real embedded image when only HWP exists.
        source = next((file for file in files if file["role"] == "web-example-image"), None)
        source = source or next((file for file in files if file["format"] == "PDF"), None)
        source = source or next((file for file in files if file["format"] == "HWP" and file["role"] == "example"), None)
        source = source or next(file for file in files if file["format"] == "HWP")
        path = source_path(source["path"])
        details = {}
        if source["format"] == "PDF":
            method = "pdf-first-page"
            with fitz.open(path) as pdf:
                scale = 720 / pdf[0].rect.width
                pix = pdf[0].get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                bitmap = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                details = {"page": 1, "sourcePages": len(pdf)}
        elif source["format"] == "HWP":
            method = "hwp-embedded-image"
            with olefile.OleFileIO(path) as ole:
                data = ole.openstream("PrvImage").read()
            bitmap = Image.open(io.BytesIO(data))
            bitmap.load()
            details = {"sourceStream": "PrvImage", "sourceStreamSha256": sha256(data)}
        else:
            assert source["format"] == "PNG"
            method = "institution-image"
            bitmap = Image.open(path)
            bitmap.load()
        assert min(bitmap.size) > 0
        assert ImageStat.Stat(bitmap.convert("L")).stddev[0] > 5, record["id"]
        destination = OUTPUT / f'{record["id"]}.png'
        if method == "institution-image":
            destination.write_bytes(path.read_bytes())
        else:
            bitmap.save(destination, format="PNG", optimize=True)
        preview = {
            "method": method,
            "sourcePath": source["path"],
            "sourceSha256": source["sha256"],
            "sourceRole": source["role"],
            "width": bitmap.width,
            "height": bitmap.height,
            "lowResolution": min(bitmap.size) < 400,
            "bytes": destination.stat().st_size,
            "sha256": sha256(destination.read_bytes()),
            **details,
        }
        record["thumbnail"] = f'/downloads/official-forms/previews/{record["id"]}.png'
        record["preview"] = preview
        checks.append({"id": record["id"], "thumbnail": record["thumbnail"], **preview})
    verify_originals(documents)
    assert len(checks) == len(documents) == 74
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    proof = {
        "records": len(checks),
        "downloadBinariesUnchanged": sum(len(record["files"]) for record in documents),
        "methods": dict(Counter(item["method"] for item in checks)),
        "lowResolution": sum(item["lowResolution"] for item in checks),
        "previews": checks,
    }
    (PROOF / "preview-integrity.json").write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding="utf-8")
    for start in range(0, len(checks), 20):
        sheet = Image.new("RGB", (1000, 1500), "#eeeeee")
        draw = ImageDraw.Draw(sheet)
        for offset, check in enumerate(checks[start:start + 20]):
            with Image.open(source_path(check["thumbnail"])) as bitmap:
                bitmap.thumbnail((226, 258))
                x, y = (offset % 4) * 250, (offset // 4) * 300
                sheet.paste(bitmap, (x + (250 - bitmap.width) // 2, y + 28))
                draw.text((x + 12, y + 8), f'{check["id"]} {check["width"]}x{check["height"]}', fill="black")
        sheet.save(PROOF / f"previews-contact-{start // 20 + 1}.png")
    print(json.dumps({key: value for key, value in proof.items() if key != "previews"}))


if __name__ == "__main__":
    main()
