"""Inspect downloaded institutional originals without modifying their bytes."""
import hashlib
import io
import json
from pathlib import Path
import struct
import sys
import zlib

import olefile
from PIL import Image

directory = Path(sys.argv[1])
reports = []
for path in sorted(directory.glob("*.hwp")):
    data = path.read_bytes()
    with olefile.OleFileIO(io.BytesIO(data)) as ole:
        header = ole.openstream("FileHeader").read()
        assert header.startswith(b"HWP Document File")
        compressed = struct.unpack_from("<I", header, 36)[0] & 1
        paragraphs = []
        for stream in ole.listdir():
            if stream[0] != "BodyText":
                continue
            body = ole.openstream(stream).read()
            if compressed:
                body = zlib.decompress(body, -15)
            offset = 0
            while offset + 4 <= len(body):
                record = struct.unpack_from("<I", body, offset)[0]
                offset += 4
                size = record >> 20
                if size == 0xFFF:
                    size = struct.unpack_from("<I", body, offset)[0]
                    offset += 4
                if record & 0x3FF == 67:
                    paragraphs.append(body[offset:offset+size].decode("utf-16le", errors="replace"))
                offset += size
        preview_text = ole.openstream("PrvText").read().decode("utf-16le", errors="replace") if ole.exists("PrvText") else ""
        preview_image = None
        if ole.exists("PrvImage"):
            raw = ole.openstream("PrvImage").read()
            try:
                picture = Image.open(io.BytesIO(raw))
                picture.load()
                preview_image = {"format": picture.format, "size": picture.size}
                picture.save(directory / (path.stem + ".png"))
            except Exception as error:
                preview_image = {"error": str(error)}
        reports.append({
            "filename": path.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "format": "HWP v5 OLE", "parsed_body_paragraphs": len(paragraphs),
            "preview_text": preview_text, "body_text": "\n".join(paragraphs),
            "preview_image": preview_image,
        })
(directory / "inspection.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
for item in reports:
    print(json.dumps({**item, "body_text": item["body_text"][:600], "preview_text": item["preview_text"][:800]}, ensure_ascii=False))
