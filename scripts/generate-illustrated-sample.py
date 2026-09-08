"""Author the seven-page illustrated sample as a real, searchable PDF.

The seven full-page, text-free illustration plates are created separately.
This script typesets exact Korean copy, figures, rules, and diagrams over those
plates. It does not edit the existing sample artwork or the tax engine.

Prerequisites: ReportLab, Pillow, pypdf, Poppler, and Nanum fonts in .tmp/fonts.
Inputs: public/media/sample-report-v3/art/page-01.jpg ... page-07.jpg.
Original PNG plates are also accepted and preserved; only encoding changes.
Outputs: seven uniformly sized WebP pages, one A4 PDF, and a viewer manifest.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import argparse
import os
from io import BytesIO
from pathlib import Path

from PIL import Image
from pypdf import PdfReader
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/media/sample-report-v3"
ART = OUT / "art"
TEMP = ROOT / ".tmp/illustrated-sample"
FONTS = ROOT / ".tmp/fonts"
W, H = 595.275590551, 841.88976378
LEFT, RIGHT = 42, W - 42
PAPER = "#F8F4EA"
INK = "#26221B"
SOFT = "#6B6152"
SEAL = "#B23A2A"
BRASS = "#7A6139"
LINE = "#C6BCAA"
PANEL = "#EFEAE0"
REFERENCES = [
    {"label": "국세청 증여세 계산흐름도", "url": "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7728&mi=2340"},
    {"label": "상속세 및 증여세법 제69조", "url": "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029616341"},
    {"label": "국세청 증여재산 공제", "url": "https://s.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7960&mi=6533"},
]

PAGES = [
    {
        "title": "세금효과 요약",
        "headline": "같은 3억원, 나누면 세금도 달라집니다.",
        "points": [
            "현금 3억원을 성년 자녀 1명에게 증여하면 추정 증여세 38,800,000원, 성년 자녀 3명에게 1억원씩 증여하면 합계 14,550,000원입니다. 차이는 24,250,000원입니다.",
            "부모 1인이 국내 거주자인 성년 자녀에게 증여하며, 10년 내 직계존속 증여가 없고 자녀별 5천만원 공제와 기한 내 신고세액공제 3%를 적용합니다. 혼인·출산 공제는 적용하지 않으며 세금은 각 자녀가 자기 자금으로 납부합니다.",
            "이번 현금 증여세만 비교한 예시입니다. 가족 전체 50억원의 절세액이나 향후 상속세를 포함한 총세금 비교가 아닙니다.",
        ],
    },
    {
        "title": "가족과 자산",
        "headline": "우리 가족의 현재 모습",
        "points": [
            "부모와 국내 거주자인 성년 자녀 3명의 가상 가족입니다. 자녀별 관심사는 사업 승계, 자산 분산, 생활 안정으로 제시합니다.",
            "가족 합산 자산은 건물 25억원, 주택 15억원, 금융자산 10억원으로 총 50억원입니다. 채무 5억원을 차감한 단순 순자산은 45억원이며 세금과 비용 차감 전입니다.",
            "첫 장의 증여 현금 3억원은 부모 1인이 소유한 금융자산 중 일부로 가정합니다. 다른 자산의 소유자와 지분은 확인할 항목입니다.",
        ],
    },
    {
        "title": "세 가지 방향 비교",
        "headline": "세 가지 방향, 무엇이 다를까요?",
        "points": [
            "A 단계적 증여는 이전 시기와 규모, 생활재원과 소유권 변화, 과거 증여와 대상 지분을 검토합니다.",
            "B 매각 후 현금 이전은 현금화와 이전, 양도세와 거래비용, 취득가액과 매각 계획을 검토합니다.",
            "C 보유 후 상속은 자산 보유와 사후 배분, 가족 배분과 납부재원, 소유관계와 공제 요건을 검토합니다. 첫 장은 현금 증여의 부분 예시이며 세 전략의 전체 세액 비교가 아닙니다.",
        ],
    },
    {
        "title": "단계적 증여",
        "headline": "한 번에 정하기보다, 나누는 기준부터.",
        "points": [
            "누구에게, 얼마를, 언제 이전할지 가족의 필요와 남겨둘 생활재원, 과거 증여 이력을 함께 살펴봅니다.",
            "현금 3억원을 세 자녀에게 1억원씩 증여하는 예시의 추정 증여세는 자녀별 4,850,000원, 합계 14,550,000원입니다.",
            "첫 장과 같은 계산 조건입니다. 증여세는 각 자녀가 자기 자금으로 납부하며 장기 상속세 절감액을 계산한 사례가 아닙니다.",
        ],
    },
    {
        "title": "매각과 상속",
        "headline": "팔아서 나눌까, 보유하며 이어갈까.",
        "points": [
            "매각 후 현금 이전은 양도소득세와 매각 비용을 먼저 확인하고, 세후 현금을 이전할 때의 증여세를 함께 계산합니다.",
            "보유 후 상속은 재산 소유자, 상속공제 요건, 가족 간 배분과 세금 납부에 필요한 현금을 확인합니다.",
            "같은 자산과 시점, 이전 범위를 정한 뒤 총세금과 실제로 남는 자산을 비교합니다. 입력하지 않은 양도세와 상속세 수치는 만들어 넣지 않았습니다.",
        ],
    },
    {
        "title": "생활비와 납부재원",
        "headline": "가족의 생활비도 함께 남겨둡니다.",
        "points": [
            "가족 금융자산 10억원의 배분 구상은 생활재원 5억원, 증여 3억원, 예비자금 2억원입니다. 금액은 설명을 위한 가상 유보액이며 당장 사용할 수 있는 순현금 계산이 아닙니다.",
            "채무 5억원의 상환 시기와 재원, 상속세와 양도세의 납부재원은 별도로 확인해야 합니다.",
            "증여세는 각 수증자가 자기 자금으로 납부하는 조건입니다. 생활재원과 예비자금은 세금 공제 항목이 아닙니다.",
        ],
    },
    {
        "title": "실행 준비",
        "headline": "이제, 확인할 순서가 보입니다.",
        "points": [
            "먼저 재산 소유자와 지분을 확인하고 과거 증여 시기와 금액을 정리합니다.",
            "같은 조건의 세액과 생활재원을 비교한 뒤 전문가가 공제 요건, 신고 기한, 실행 절차를 검토합니다.",
            "첫 장은 현금 3억원 증여의 가상 사례입니다. 세법 기준 확인일은 2026-09-08이며 개인별 결과는 실제 입력 조건에 따라 달라집니다.",
        ],
    },
]


def gift_tax(gross_won: int) -> int:
    """This fixture uses only the ordinary first two gift-tax brackets."""
    base = gross_won - 50_000_000
    assessed = base // 10 if base <= 100_000_000 else base * 20 // 100 - 10_000_000
    return assessed * 97 // 100


ONE_TAX = gift_tax(300_000_000)
EACH_TAX = gift_tax(100_000_000)
THREE_TAX = EACH_TAX * 3
DIFFERENCE = ONE_TAX - THREE_TAX
assert (ONE_TAX, EACH_TAX, THREE_TAX, DIFFERENCE) == (38_800_000, 4_850_000, 14_550_000, 24_250_000)


class Report:
    def __init__(self, preview_first_three: bool = False) -> None:
        self.preview_first_three = preview_first_three
        required = range(1, 4) if preview_first_three else range(1, 8)
        missing = [str(ART / f"page-{n:02d}.jpg") for n in required if not any((ART / f"page-{n:02d}.{ext}").is_file() for ext in ["jpg", "png"])]
        if missing:
            raise SystemExit("Missing illustration plates; no report was written:\n" + "\n".join(missing))
        for n in required:
            png, jpeg = ART / f"page-{n:02d}.png", ART / f"page-{n:02d}.jpg"
            if png.is_file() and (not jpeg.is_file() or png.stat().st_mtime > jpeg.stat().st_mtime):
                # Format conversion only: preserve dimensions, colors and art.
                # ReportLab embeds JPEG directly, keeping the vector-text PDF small.
                with Image.open(png) as original:
                    original.convert("RGB").save(jpeg, "JPEG", quality=88, optimize=True)
        for name, file in [("Serif", "serif.ttf"), ("SerifB", "serifbold.ttf"), ("Sans", "NanumGothic-Regular.ttf"), ("SansB", "sansbold.ttf")]:
            pdfmetrics.registerFont(TTFont(name, str(FONTS / file)))
        pdfmetrics.registerFont(TTFont("Numbers", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"))
        OUT.mkdir(parents=True, exist_ok=True)
        TEMP.mkdir(parents=True, exist_ok=True)
        self.pdf_path = TEMP / "preview-first-three.pdf" if preview_first_three else OUT / "sample-report.pdf"
        self.c = canvas.Canvas(str(self.pdf_path), pagesize=(W, H), pageCompression=1)
        self.c.setTitle("자산승계 360 | 그림으로 보는 7장 샘플 보고서")
        self.c.setAuthor("자산승계 360")
        self.c.setSubject("가상 가족의 자산승계 방향과 현금 3억원 증여세 예시 | 2026-09-08")
        self.records: list[dict] = []

    def text(self, x: float, y: float, value: str, size: float = 11, font: str = "Sans", color: str = INK, align: str = "left", max_width: float | None = None) -> None:
        width = pdfmetrics.stringWidth(value, font, size)
        if max_width is not None and width > max_width + .01:
            raise ValueError(f"Text wider than its panel: {value!r}: {width:.1f} > {max_width:.1f}")
        xx = x - width / 2 if align == "center" else x - width if align == "right" else x
        if xx < 35 or xx + width > W - 35 or y < 16 or y + size > H - 13:
            raise ValueError(f"Text outside page: {value!r}, x={xx:.1f}, y={y:.1f}, width={width:.1f}")
        self.c.setFillColor(HexColor(color))
        self.c.setFont(font, size)
        self.c.drawString(xx, H - y - size, value)
        self.records.append({"page": self.c.getPageNumber(), "text": value, "x": xx, "y": y, "width": width, "size": size})

    def render_pngs(self, pdf_path: Path, prefix: Path, count: int) -> None:
        poppler = shutil.which("pdftoppm")
        if not poppler:
            raise SystemExit("pdftoppm is required to render and inspect the report.")
        args = [poppler, "-png", "-scale-to-x", "1400", "-scale-to-y", "1980"]
        subprocess.run([*args, str(pdf_path), str(prefix)], check=True, capture_output=True)
        for n in range(1, count + 1):
            path = prefix.with_name(prefix.name + f"-{n}.png")
            try:
                with Image.open(path) as picture:
                    picture.verify()
            except (OSError, SyntaxError):
                # A truncated temporary PNG was observed during preview. Only
                # retry that page once, and reject it if verification still fails.
                subprocess.run([*args, "-f", str(n), "-l", str(n), str(pdf_path), str(prefix)], check=True, capture_output=True)
                with Image.open(path) as picture:
                    picture.verify()

    def lines(self, x: float, y: float, values: list[str], size: float = 11, leading: float = 17, **kwargs) -> None:
        for i, value in enumerate(values):
            self.text(x, y + leading * i, value, size, **kwargs)

    def line(self, x1: float, y1: float, x2: float, y2: float, color: str = LINE, width: float = .7) -> None:
        self.c.setStrokeColor(HexColor(color))
        self.c.setLineWidth(width)
        self.c.line(x1, H - y1, x2, H - y2)

    def box(self, x: float, y: float, width: float, height: float, fill: str | None = None, stroke: str | None = LINE, alpha: float = 1) -> None:
        self.c.saveState()
        self.c.setLineWidth(.55)
        self.c.setStrokeColor(HexColor(stroke or PAPER))
        if fill:
            self.c.setFillColor(HexColor(fill))
            self.c.setFillAlpha(alpha)
        self.c.rect(x, H - y - height, width, height, stroke=int(stroke is not None), fill=int(fill is not None))
        self.c.restoreState()

    def circle(self, x: float, y: float, radius: float, fill: str = PAPER, stroke: str = BRASS) -> None:
        self.c.setFillColor(HexColor(fill))
        self.c.setStrokeColor(HexColor(stroke))
        self.c.setLineWidth(.8)
        self.c.circle(x, H - y, radius, stroke=1, fill=1)

    def person(self, x: float, y: float, scale: float = 1) -> None:
        self.c.setStrokeColor(HexColor(BRASS))
        self.c.setLineWidth(1)
        self.c.circle(x, H - y, 4.7 * scale, stroke=1, fill=0)
        path = self.c.beginPath()
        path.moveTo(x - 9 * scale, H - y - 20 * scale)
        path.curveTo(x - 9 * scale, H - y - 6 * scale, x + 9 * scale, H - y - 6 * scale, x + 9 * scale, H - y - 20 * scale)
        path.close()
        self.c.drawPath(path, stroke=1, fill=0)

    def icon(self, kind: str, x: float, y: float, scale: float = 1) -> None:
        self.c.saveState()
        self.c.translate(x, H - y)
        self.c.scale(scale, scale)
        self.c.setStrokeColor(HexColor(BRASS))
        self.c.setLineWidth(1.2)
        self.c.setLineJoin(1)
        if kind == "home":
            path = self.c.beginPath()
            path.moveTo(-15, 0)
            path.lineTo(0, 13)
            path.lineTo(15, 0)
            self.c.drawPath(path)
            self.c.rect(-11, -19, 22, 19, stroke=1, fill=0)
            self.c.rect(-3, -19, 6, 10, stroke=1, fill=0)
        elif kind == "building":
            self.c.rect(-10, -19, 20, 33, stroke=1, fill=0)
            for xx in [-5, 3]:
                for yy in [-10, 0, 9]:
                    self.c.rect(xx, yy, 2, 3, stroke=1, fill=0)
        elif kind == "coins":
            for yy in [-14, -6, 2]:
                self.c.ellipse(-12, yy, 12, yy + 7, stroke=1, fill=0)
                self.c.line(-12, yy + 3, -12, yy - 2)
                self.c.line(12, yy + 3, 12, yy - 2)
        elif kind == "doc":
            path = self.c.beginPath()
            for i, point in enumerate([(-10, -19), (-10, 14), (5, 14), (11, 8), (11, -19)]):
                (path.moveTo if i == 0 else path.lineTo)(*point)
            path.close()
            self.c.drawPath(path)
            self.c.line(5, 14, 5, 8)
            self.c.line(5, 8, 11, 8)
            for yy in [2, -4, -10]:
                self.c.line(-5, yy, 6, yy)
        elif kind == "gift":
            self.c.rect(-13, -17, 26, 19, stroke=1, fill=0)
            self.c.rect(-15, 2, 30, 6, stroke=1, fill=0)
            self.c.line(0, -17, 0, 9)
            path = self.c.beginPath()
            path.moveTo(0, 8)
            path.curveTo(-19, 25, -15, 0, 0, 8)
            path.curveTo(19, 25, 15, 0, 0, 8)
            self.c.drawPath(path)
        elif kind == "family":
            for xx, yy in [(-9, 3), (9, 3), (0, 10)]:
                self.c.circle(xx, yy, 3.5, stroke=1, fill=0)
            for xx in [-9, 9]:
                self.c.roundRect(xx - 6, -15, 12, 12, 4, stroke=1, fill=0)
        self.c.restoreState()

    def illustration(self, n: int, source: tuple[float, float, float, float], target: tuple[float, float, float, float]) -> None:
        """Place an unmodified illustration plate in a clipped PDF image frame."""
        sx, sy, sw, sh = source
        x, y, width, height = target
        scale_x, scale_y = width / sw, height / sh
        image_top = y - sy * scale_y
        self.c.saveState()
        clip = self.c.beginPath()
        clip.rect(x, H - y - height, width, height)
        self.c.clipPath(clip, stroke=0, fill=0)
        jpeg = ART / f"page-{n:02d}.jpg"
        source_path = jpeg if jpeg.is_file() else ART / f"page-{n:02d}.png"
        self.c.drawImage(str(source_path), x - sx * scale_x, H - image_top - H * scale_y, width=W * scale_x, height=H * scale_y, mask="auto")
        self.c.restoreState()

    def header(self, n: int, title: list[str], subtitle: str | None = None, size: float = 28) -> None:
        # The source art remains intact. Its empty paper area supplies a subtle
        # paper background; illustrations occupy individual document frames.
        self.box(0, 0, W, H, PAPER, None)
        self.illustration(3, (0, 0, W, 240), (0, 0, W, H))
        if n == 1:
            self.illustration(1, (294, 0, 301, 252), (383, 69, 170, 143))
        elif n == 2:
            self.illustration(2, (325, 0, 270, 285), (392, 65, 161, 170))
        elif n == 3:
            self.illustration(3, (0, 283, W, 163), (48, 332, 499, 137))
        elif n == 4:
            self.illustration(4, (15, 175, 565, 275), (42, 238, 511, 248.72))
        elif n == 5:
            self.illustration(5, (20, 250, 555, 235), (42, 265, 511, 216.36))
        elif n == 6:
            self.illustration(6, (325, 0, 270, 270), (383, 70, 170, 170))
        elif n == 7:
            self.illustration(7, (315, 0, 280, 270), (383, 70, 170, 163.93))
        else:
            self.illustration(n, (0, 0, W, H), (0, 0, W, H))
        self.text(LEFT, 25, "자산승계 360", 14, "SerifB")
        self.text(RIGHT, 31, "가상 가족 A · SAMPLE", 7.6, "Sans", SOFT, "right")
        self.line(LEFT, 52, RIGHT, 52, BRASS, .65)
        self.text(LEFT, 66, f"{n:02d}", 34, "Numbers", SEAL)
        self.text(109, 82, PAGES[n - 1]["title"], 11.5, "SerifB")
        self.line(109, 103, 209, 103, BRASS, .5)
        self.lines(LEFT, 122, title, size, 35, font="SerifB", max_width=RIGHT - LEFT)
        if subtitle:
            self.text(LEFT, 166 if len(title) == 1 else 204, subtitle, 10.2, "Sans", SOFT)

    def footer(self, n: int) -> None:
        self.line(LEFT, 795, RIGHT, 795, BRASS, .6)
        self.text(LEFT, 806, "샘플 · 가상 사례 · 추정 세액 · 전문가 검토 전", 7.2, "Sans", SOFT)
        self.text(RIGHT, 805, f"{n:02d} / 07", 8.2, "Numbers", INK, "right")
        self.c.showPage()

    def page_one(self) -> None:
        self.header(1, ["같은 3억원,", "나누면 세금도 달라집니다."], "현금 3억원 증여 · 성년 자녀 수에 따른 비교")
        for x, label, amount, note in [(42, "자녀 1명에게 3억원", "3,880", "1명의 추정 증여세"), (306, "자녀 3명에게 1억원씩", "1,455", "3명의 추정 증여세 합계")]:
            self.box(x, 268, 247, 147, PANEL, LINE, .62)
            self.text(x + 17, 286, label, 11, "SansB", max_width=214)
            self.text(x + 17, 321, amount, 37, "Numbers")
            self.text(x + 133, 344, "만원", 13, "SerifB")
            self.text(x + 17, 389, note, 9.1, "Sans", SOFT)
        self.line(LEFT, 449, RIGHT, 449, BRASS, .65)
        self.text(LEFT, 472, "추정 증여세 차이", 13, "SansB", SEAL)
        self.text(LEFT - 1, 504, "2,425", 69, "Numbers", SEAL)
        self.text(252, 553, "만원", 20, "SerifB", SEAL)
        self.text(LEFT, 604, "자녀별 공제와 누진세율 적용에 따른 차이입니다.", 12, "SerifB")
        self.line(LEFT, 646, RIGHT, 646, LINE, .6)
        self.lines(LEFT, 663, [
            "국내 거주자인 성년 자녀 · 10년 내 직계존속 증여 없음",
            "자녀별 5천만원 공제 · 기한 내 신고 3% 공제 · 혼인·출산 공제 미적용",
            "부모 1인의 현금 증여 · 세금은 각 자녀가 자기 자금으로 납부",
        ], 8.8, 19, color=SOFT)
        self.text(LEFT, 745, "이번 현금 증여세만 비교한 예시이며, 가족 전체 50억원·향후 상속세 비교는 아닙니다.", 8.8, "SansB", SOFT)
        self.footer(1)

    def page_two(self) -> None:
        self.header(2, ["우리 가족의 현재 모습"], "가족 합산 자산 · 소유자와 지분은 함께 확인합니다.")
        self.box(LEFT, 246, 511, 189, None, LINE)
        self.person(267, 270, .8)
        self.person(321, 270, .8)
        self.line(280, 283, 308, 283)
        self.text(295, 304, "부모 세대", 12, "SerifB", align="center")
        self.line(295, 327, 295, 344)
        self.line(126, 344, 469, 344)
        for x, name, role in [(126, "첫째 자녀", "사업 승계"), (297, "둘째 자녀", "자산 분산"), (469, "셋째 자녀", "생활 안정")]:
            self.line(x, 344, x, 355)
            self.person(x, 365, .6)
            self.text(x, 389, name, 10.6, "SansB", align="center")
            self.text(x, 410, role, 9.3, "Sans", SOFT, "center")
        self.text(LEFT, 458, "한눈에 보는 자산", 14, "SerifB")
        for x, kind, label, amount in [(42, "building", "건물", "25억원"), (217, "home", "주택", "15억원"), (392, "coins", "금융자산", "10억원")]:
            self.box(x, 490, 161, 144, PANEL, LINE, .45)
            self.icon(kind, x + 27, 519, .63)
            self.text(x + 50, 510, label, 10.5, "SansB")
            self.text(x + 20, 561, amount, 25, "SerifB", SEAL)
            self.line(x + 17, 607, x + 143, 607, LINE, .5)
        self.text(LEFT, 661, "가족 합산 자산 50억원", 11, "SansB", SOFT)
        self.text(RIGHT, 661, "채무 5억원", 11, "SansB", SOFT, "right")
        self.line(LEFT, 690, RIGHT, 690, LINE, .5)
        self.text(LEFT, 704, "채무 차감 후 순자산", 12, "SerifB")
        self.text(RIGHT, 696, "45억원", 26, "SerifB", SEAL, "right")
        self.lines(LEFT, 750, ["첫 장의 현금 3억원은 부모 1인이 소유한 금융자산 중 일부입니다.", "순자산은 세금과 비용 차감 전 단순 합계입니다."], 8.3, 16, color=SOFT)
        self.footer(2)

    def page_three(self) -> None:
        self.header(3, ["세 가지 방향, 무엇이 다를까요?"], "증여 · 매각 후 현금 이전 · 보유 후 상속", 28)
        columns = [
            (42, "A", "단계적 증여", ["이전 시기와 규모", "생활재원과 소유권", "과거 증여 · 대상 지분"]),
            (214, "B", "매각 후 현금 이전", ["현금화와 이전", "양도세와 거래비용", "취득가액 · 매각 계획"]),
            (386, "C", "보유 후 상속", ["자산 보유와 사후 배분", "가족 배분과 납부재원", "소유관계 · 공제 요건"]),
        ]
        for x, letter, title, content in columns:
            self.box(x, 230, 167, 465, None, LINE)
            self.text(x + 83.5, 242, letter, 41, "Numbers", SEAL, "center")
            self.text(x + 83.5, 294, title, 13.3, "SerifB", INK, "center", 157)
            self.line(x + 12, 319, x + 155, 319, BRASS, .65)
            for row, (label, detail, kind) in enumerate(zip(["검토 초점", "함께 볼 것", "확인할 정보"], content, ["doc", "family", "doc"])):
                y = 475 + row * 71
                self.icon(kind, x + 21, y + 13, .48)
                self.text(x + 42, y, label, 10.3, "SansB", max_width=115)
                self.text(x + 13, y + 29, detail, 9.5, "Sans", SOFT, max_width=144)
                if row < 2:
                    self.line(x + 12, y + 58, x + 155, y + 58, LINE, .5)
        self.box(LEFT, 717, 511, 51, PANEL, None, .6)
        self.line(LEFT, 717, LEFT, 768, SEAL, 2.5)
        self.text(58, 727, "세금뿐 아니라, 생활재원과 가족의 선택을 함께 봅니다.", 12, "SerifB", SEAL)
        self.text(58, 750, "첫 장은 현금 증여의 부분 예시로, 세 전략의 전체 세액 비교는 아닙니다.", 8.1, "Sans", SOFT)
        self.footer(3)

    def page_four(self) -> None:
        self.header(4, ["한 번에 정하기보다,", "나누는 기준부터."], "단계적 증여 · 가족의 필요와 남겨둘 자산을 함께 검토합니다.")
        for x, step, title, detail in [(42, "01", "누구에게", "자녀별 필요와 형평"), (214, "02", "얼마를", "생활재원을 남긴 규모"), (386, "03", "언제", "과거 증여와 이전 시기")]:
            self.box(x, 492, 167, 148, PANEL, LINE, .53)
            self.text(x + 16, 507, step, 13, "Numbers", BRASS)
            self.text(x + 16, 538, title, 20, "SerifB")
            self.text(x + 16, 591, detail, 10.2, "Sans", SOFT, max_width=137)
        self.line(LEFT, 670, RIGHT, 670, BRASS, .65)
        self.text(LEFT, 688, "3억원을 세 자녀에게 1억원씩", 19, "SerifB")
        self.text(LEFT, 724, "추정 증여세 합계 1,455만원", 20, "SerifB", SEAL)
        self.text(LEFT, 762, "첫 장과 같은 조건 · 자녀별 485만원 · 각 자녀의 자기 자금으로 납부", 8.3, "Sans", SOFT)
        self.footer(4)

    def page_five(self) -> None:
        self.header(5, ["팔아서 나눌까,", "보유하며 이어갈까."], "소유 방식이 달라지면, 확인할 세금과 재원도 달라집니다.")
        self.line(298, 235, 298, 683, LINE, .7)
        self.text(165, 237, "매각 후 현금 이전", 18, "SerifB", INK, "center")
        self.text(434, 237, "보유 후 상속", 18, "SerifB", INK, "center")
        for x, groups in [(LEFT, [("양도세 먼저 확인", "취득가액 · 보유기간 · 매각 비용"), ("현금 증여세 함께 계산", "세후 현금을 누구에게 나눌지")]), (322, [("소유자·공제 확인", "자산 명의 · 상속인 · 공제 요건"), ("현금 납부재원 준비", "가족 배분 · 생활비 · 세금 납부")])]:
            for i, (title, detail) in enumerate(groups):
                y = 505 + i * 96
                self.line(x, y - 13, x + 228, y - 13, LINE, .5)
                self.text(x, y, title, 15, "SerifB", max_width=228)
                self.text(x, y + 34, detail, 9.7, "Sans", SOFT, max_width=228)
        self.box(LEFT, 706, 511, 62, PANEL, None, .57)
        self.text(LEFT + 16, 719, "같은 자산과 시점을 정한 뒤 비교합니다.", 14, "SerifB", SEAL)
        self.text(LEFT + 16, 746, "총세금과 실제로 남는 자산을 함께 확인합니다.", 10, "Sans", SOFT)
        self.footer(5)

    def page_six(self) -> None:
        self.header(6, ["가족의 생활비도", "함께 남겨둡니다."], "남겨둘 돈, 나눌 돈, 예비자금을 먼저 구분합니다.")
        self.text(LEFT, 264, "금융자산 10억원의 배분 구상", 16, "SerifB")
        for x, kind, label, amount, note in [(42, "home", "생활재원", "5억원", "일상을 위한 유보액"), (214, "gift", "증여", "3억원", "자녀에게 나눌 자산"), (386, "coins", "예비자금", "2억원", "변화에 대비할 여유")]:
            self.box(x, 311, 167, 204, PANEL, LINE, .47)
            self.icon(kind, x + 83.5, 350, 1.02)
            self.text(x + 83.5, 393, label, 12.5, "SansB", INK, "center")
            self.text(x + 83.5, 423, amount, 28, "SerifB", SEAL, "center")
            self.text(x + 83.5, 479, note, 9.3, "Sans", SOFT, "center")
        self.text(LEFT, 554, "나누기 전에, 별도로 확인할 돈", 17, "SerifB")
        self.line(LEFT, 588, RIGHT, 588, LINE, .6)
        for y, label, detail in [(607, "채무 5억원", "상환 시기와 재원을 확인합니다."), (655, "상속세·양도세", "선택한 전략에 맞춰 납부재원을 계산합니다.")]:
            self.text(LEFT, y, label, 12, "SansB")
            self.text(190, y + 1, detail, 10.1, "Sans", SOFT)
        self.lines(LEFT, 733, ["5억·3억·2억은 가상 배분안이며, 채무·세금 차감 후 가용현금이 아닙니다.", "증여세는 각 자녀의 자기 자금으로 납부합니다. 생활재원은 세금 공제가 아닙니다."], 8.3, 18, color=SOFT)
        self.footer(6)

    def page_seven(self) -> None:
        self.header(7, ["이제, 확인할 순서가", "보입니다."], "서두르기 전에 네 가지를 확인합니다.")
        self.line(64, 291, 64, 630, LINE, 1.2)
        items = [
            (273, "1", "자산 소유자 확인", "명의와 지분, 채무를 함께 정리합니다."),
            (378, "2", "과거 증여 확인", "누구에게 언제 얼마를 줬는지 살펴봅니다."),
            (483, "3", "세액·생활재원 비교", "같은 조건에서 세금과 남겨둘 돈을 비교합니다."),
            (588, "4", "전문가 검토 후 실행", "공제 요건과 신고 기한, 실행 절차를 확인합니다."),
        ]
        for y, num, title, detail in items:
            self.circle(64, y + 23, 22, PAPER, BRASS)
            self.text(64, y + 8, num, 22, "Numbers", BRASS, "center")
            self.text(107, y + 3, title, 18, "SerifB")
            self.text(107, y + 39, detail, 10.4, "Sans", SOFT)
        self.line(LEFT, 692, RIGHT, 692, BRASS, .65)
        self.text(LEFT, 713, "우리 가족이 이해하고 선택하는 자산승계.", 19, "SerifB", SEAL)
        self.text(LEFT, 753, "세법 확인 2026.09.08 · 첫 장은 현금 3억원 증여의 가상 계산 예시입니다.", 8.1, "Sans", SOFT)
        x = LEFT
        for reference in REFERENCES:
            label = reference["label"]
            self.text(x, 775, label, 6.7, "Sans", SOFT)
            width = pdfmetrics.stringWidth(label, "Sans", 6.7)
            self.c.linkURL(reference["url"], (x, H - 783, x + width, H - 774), relative=0)
            x += width + 20
        self.footer(7)

    def render(self) -> None:
        if self.preview_first_three:
            self.render_preview()
            return
        for method in [self.page_one, self.page_two, self.page_three, self.page_four, self.page_five, self.page_six, self.page_seven]:
            method()
        self.c.save()
        document = PdfReader(OUT / "sample-report.pdf")
        assert len(document.pages) == 7
        for i, page in enumerate(document.pages):
            assert abs(float(page.mediabox.width) - W) < .1
            assert abs(float(page.mediabox.height) - H) < .1
            page_text = page.extract_text()
            assert "자산승계 360" in page_text
            assert "전문가 검토 전" in page_text
            assert PAGES[i]["title"] in page_text
        first_text = document.pages[0].extract_text()
        assert all(value in first_text for value in ["3,880", "1,455", "2,425", "직계존속", "국내 거주자"])
        (TEMP / "text-bounds.json").write_text(json.dumps(self.records, ensure_ascii=False, indent=2), encoding="utf-8")
        self.render_pngs(OUT / "sample-report.pdf", TEMP / "render", 7)
        for n, page in enumerate(PAGES, 1):
            with Image.open(TEMP / f"render-{n}.png") as rendered:
                assert rendered.size == (1400, 1980)
                encoded = BytesIO()
                rendered.convert("RGB").save(encoded, "WEBP", quality=95, method=6)
            data = encoded.getvalue()
            with Image.open(BytesIO(data)) as check:
                check.load()
                assert check.size == (1400, 1980)
            asset = OUT / f"page-{n:02d}.webp"
            temporary = TEMP / f"page-{n:02d}.webp.tmp"
            with temporary.open("wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, asset)
            with Image.open(asset) as check:
                check.load()
                assert check.size == (1400, 1980)
            page.update({"image": f"/media/sample-report-v3/page-{n:02d}.webp", "width": 1400, "height": 1980, "sha256": hashlib.sha256(asset.read_bytes()).hexdigest()})
        manifest = {
            "version": 3,
            "lawCheckedOn": "2026-09-08",
            "pdf": "/media/sample-report-v3/sample-report.pdf",
            "scenario": "가족 합산 자산 50억원·채무 5억원의 가상 가족. 세금효과는 부모 1인의 현금 3억원 증여만 비교.",
            "pages": PAGES,
            "taxesWon": [ONE_TAX, THREE_TAX],
            "differenceWon": DIFFERENCE,
            "taxScope": "현금 3억원 증여세만 비교. 가족 자산 50억원 전체 또는 향후 상속세를 합산한 비교가 아님.",
            "giftTax": {"giftAmountWon": 300_000_000, "oneRecipientTaxWon": ONE_TAX, "threeRecipientEachTaxWon": EACH_TAX, "threeRecipientTotalTaxWon": THREE_TAX, "differenceWon": DIFFERENCE},
            "references": REFERENCES,
        }
        (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"pdf": str(OUT / "sample-report.pdf"), "pages": len(PAGES), "dimensions": [1400, 1980], "textRecords": len(self.records), "taxesWon": manifest["taxesWon"], "differenceWon": DIFFERENCE}, ensure_ascii=False))

    def render_preview(self) -> None:
        """Temporary artwork check; never writes the public viewer assets."""
        for method in [self.page_one, self.page_two, self.page_three]:
            method()
        self.c.save()
        reader = PdfReader(self.pdf_path)
        assert len(reader.pages) == 3
        for page in reader.pages:
            assert abs(float(page.mediabox.width) - W) < .1
            assert abs(float(page.mediabox.height) - H) < .1
            assert "전문가 검토 전" in page.extract_text()
        self.render_pngs(self.pdf_path, TEMP / "preview", 3)
        print(json.dumps({"previewPdf": str(self.pdf_path), "pages": 3, "textRecords": len(self.records), "bytes": self.pdf_path.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview-first-three", action="store_true", help="Render only three existing plates into .tmp; never replace final assets.")
    Report(preview_first_three=parser.parse_args().preview_first_three).render()
