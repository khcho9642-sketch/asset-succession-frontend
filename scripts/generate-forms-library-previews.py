"""Render only the first page of registered fictional examples.

No source DOCX/XLSX/PDF is edited. Manifest checks fail on mismatches.
Install PyMuPDF and Pillow; run from the repository root.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "public/downloads/asset-succession-forms-v1"
OUTPUT = LIBRARY / "previews"
PROOF = ROOT / ".tmp/forms-library-proof"
OUTPUT.mkdir(parents=True, exist_ok=True)
PROOF.mkdir(parents=True, exist_ok=True)
manifest = json.loads((LIBRARY / "04_사이트등록/forms_manifest.json").read_text(encoding="utf-8"))
checks = []
for record in manifest["documents"]:
    for field, hash_field in [("editable_file", "sha256"), ("example_file", "example_sha256")]:
        file = (LIBRARY / record[field]).resolve()
        assert file.is_relative_to(LIBRARY.resolve()), "Path outside approved library"
        assert hashlib.sha256(file.read_bytes()).hexdigest() == record[hash_field], str(file)
    with fitz.open(LIBRARY / record["example_file"]) as pdf:
        pix = pdf[0].get_pixmap(matrix=fitz.Matrix(720 / pdf[0].rect.width, 720 / pdf[0].rect.width), alpha=False)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        destination = OUTPUT / (record["id"].lower() + ".webp")
        image.save(destination, format="WEBP", quality=86, method=6)
        checks.append({"id": record["id"], "original_document_hashes_match": True,
                       "preview": str(destination.relative_to(ROOT)), "width": image.width,
                       "height": image.height, "example_pdf_pages": len(pdf)})
assert len(checks) == 10
(PROOF / "document-integrity.json").write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"source_documents_verified": 20, "thumbnails_rendered": len(checks)}, ensure_ascii=False))
