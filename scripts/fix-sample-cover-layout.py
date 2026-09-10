"""Retypeset only the sample cover; retain pages 2-7 and all tax assumptions.

Uses the existing report's drawing helpers and original illustration plates.
Writes versioned cover/PDF assets, then switches the shared viewer manifest.
Requires Pillow, ReportLab, pypdf, PyMuPDF and Nanum/DejaVu system fonts.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

import fitz
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/media/sample-report-v3"
TEMP = ROOT / ".tmp/sample-cover-layout"
TEMP.mkdir(parents=True, exist_ok=True)
manifest_path = OUT / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
assert len(manifest["pages"]) == 7
assert manifest["taxesWon"] == [1491000000, 916000000]
assert manifest["differenceWon"] == 575000000
unchanged_entries = json.dumps(manifest["pages"][1:], ensure_ascii=False, sort_keys=True)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


protected = [ROOT / "public" / page["image"].lstrip("/") for page in manifest["pages"][1:]]
protected += [OUT / "sample-report.pdf"]
before_hashes = {str(path): digest(path) for path in protected}

spec = importlib.util.spec_from_file_location("illustrated_sample", ROOT / "scripts/generate-illustrated-sample.py")
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
W, H = module.W, module.H
L, R = module.LEFT, module.RIGHT
INK, SOFT, SEAL, BRASS, LINE, PANEL = module.INK, module.SOFT, module.SEAL, module.BRASS, module.LINE, module.PANEL

font_sources = {
    "Serif": [ROOT / ".tmp/fonts/serif.ttf", Path("/usr/share/fonts/truetype/nanum/NanumMyeongjo.ttf")],
    "SerifB": [ROOT / ".tmp/fonts/serifbold.ttf", Path("/usr/share/fonts/truetype/nanum/NanumMyeongjoBold.ttf")],
    "Sans": [ROOT / ".tmp/fonts/NanumGothic-Regular.ttf", Path("/usr/share/fonts/truetype/nanum/NanumGothic.ttf")],
    "SansB": [ROOT / ".tmp/fonts/sansbold.ttf", Path("/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf")],
    "Numbers": [Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf")],
}
for name, candidates in font_sources.items():
    source = next((p for p in candidates if p.is_file()), None)
    if source is None:
        raise RuntimeError(f"Missing required font: {name}")
    pdfmetrics.registerFont(TTFont(name, str(source)))

# Bypass the original constructor: it opens the existing seven-page PDF for
# writing. This task must NEVER truncate or regenerate that original file.
report = module.Report.__new__(module.Report)
report.preview_first_three = False
report.records = []
cover_pdf = TEMP / "cover.pdf"
report.pdf_path = cover_pdf
report.c = canvas.Canvas(str(cover_pdf), pagesize=(W, H), pageCompression=1)
report.c.setTitle("자산승계 360 | 세금효과 요약")
report.c.setAuthor("자산승계 360")

# Identical header, margins, paper texture, illustration and footer system.
# Page 2 uses a 28pt title and 25-26pt financial figures; do not make 5.75 a poster.
report.header(1, ["상속재산 배분에 따라,", "세금도 달라집니다."],
              "상속재산 52억원 · 배우자 상속분에 따른 별도 비교", size=28)
report.text(L, 250, "같은 재산, 다른 배분을 비교합니다.", 14, "SerifB")

for x, label, amount, note, bar_width, color in [
    (42, "배우자 최소 공제 적용", "14.91억원", "비교 기준안 · 추정 상속세", 209, BRASS),
    (306, "배우자 법정지분 상속", "9.16억원", "배분 대안 · 추정 상속세", 209 * 9.16 / 14.91, SEAL),
]:
    report.box(x, 282, 247, 165, PANEL, LINE, .45)
    report.text(x + 18, 300, label, 11, "SansB", max_width=211)
    report.text(x + 18, 337, amount, 25, "SerifB", color, max_width=211)
    report.line(x + 18, 382, x + 229, 382, LINE, .5)
    report.box(x + 18, 394, 209, 5, "#DED7C9", None)
    report.box(x + 18, 394, bar_width, 5, color, None)
    report.text(x + 18, 417, note, 9, "Sans", SOFT, max_width=211)

report.line(L, 475, R, 475, BRASS, .65)
report.text(L, 496, "기준안과의 추정 세액 차이", 12, "SerifB")
report.text(R, 488, "약 5.75억원", 26, "SerifB", SEAL, "right")
report.text(L, 536, "배우자의 상속분과 공제 적용 조건에 따라 달라지는 금액입니다.", 10, "Sans", SOFT)
report.line(L, 565, R, 565, LINE, .6)

report.text(L, 587, "숫자와 함께 확인할 조건", 14, "SerifB")
for y, number, heading, description in [
    (625, "1", "실제 상속분", "배우자가 실제로 상속받는 재산과 배분 내용을 확인합니다."),
    (669, "2", "공제 적용 조건", "배우자 상속공제 등 계산에 적용한 조건을 확인합니다."),
    (713, "3", "비교의 범위", "52억원 상속재산의 별도 예시이며, 다음 장 가족표와 구분합니다."),
]:
    report.circle(L + 9, y + 10, 9)
    report.text(L + 9, y + 3, number, 10, "Numbers", BRASS, "center")
    report.text(L + 29, y, heading, 11, "SansB")
    report.text(L + 142, y + 1, description, 8.6, "Sans", SOFT, max_width=R - L - 142)

report.text(L, 764, "가상 사례 · 전문가 검토 전 추정 세액 · 실제 조건에 따라 결과가 달라집니다.", 8.3, "Sans", SOFT)
report.footer(1)
report.c.save()

old_pdf = OUT / "sample-report.pdf"
new_pdf = OUT / "sample-report-layout-v5.pdf"
old_reader = PdfReader(str(old_pdf))
assert len(old_reader.pages) == 7
writer = PdfWriter()
writer.add_page(PdfReader(str(cover_pdf)).pages[0])
for page in old_reader.pages[1:]:
    writer.add_page(page)
if old_reader.metadata:
    writer.add_metadata({key: str(value) for key, value in old_reader.metadata.items() if value is not None})
with new_pdf.open("wb") as stream:
    writer.write(stream)


def render(page: fitz.Page, width: int = 1400, height: int = 1980) -> Image.Image:
    pix = page.get_pixmap(matrix=fitz.Matrix(width / page.rect.width, height / page.rect.height), alpha=False)
    picture = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    return picture if picture.size == (width, height) else picture.resize((width, height), Image.Resampling.LANCZOS)


with fitz.open(str(old_pdf)) as old, fitz.open(str(new_pdf)) as new:
    assert len(new) == 7
    before = render(old[0])
    after = render(new[0])
    second = render(new[1])
    before.save(TEMP / "cover-before.png")
    after.save(TEMP / "cover-after.png")
    second.save(TEMP / "page-two-unchanged.png")
    after.save(OUT / "page-01-layout-v5.webp", "WEBP", quality=94, method=6)
    assert "5.75" in new[0].get_text()
    assert "14.91" in new[0].get_text() and "9.16" in new[0].get_text()
    for index in range(1, 7):
        assert old[index].get_text() == new[index].get_text(), f"Page {index + 1} text changed"
        assert old[index].get_pixmap(alpha=False).samples == new[index].get_pixmap(alpha=False).samples, f"Page {index + 1} render changed"
    page_two_fonts = sorted({span["font"] for block in new[1].get_text("dict")["blocks"] if "lines" in block for line in block["lines"] for span in line["spans"]})

assert {str(path): digest(path) for path in protected} == before_hashes
manifest["version"] = 5
manifest["pdf"] = "/media/sample-report-v3/sample-report-layout-v5.pdf"
manifest["pages"][0].update({
    "image": "/media/sample-report-v3/page-01-layout-v5.webp",
    "width": 1400,
    "height": 1980,
    "sha256": digest(OUT / "page-01-layout-v5.webp"),
})
assert json.dumps(manifest["pages"][1:], ensure_ascii=False, sort_keys=True) == unchanged_entries
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

summary = {
    "changed_visible_pages": [1],
    "unchanged_pdf_pages": [2, 3, 4, 5, 6, 7],
    "original_files_unchanged": True,
    "title_pt": 28,
    "comparison_amount_pt": 25,
    "difference_amount_pt": 26,
    "tax_values_unchanged": True,
    "page_two_fonts": page_two_fonts,
    "cover_image": manifest["pages"][0]["image"],
    "cover_sha256": manifest["pages"][0]["sha256"],
    "pdf": manifest["pdf"],
}
(TEMP / "verification.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
