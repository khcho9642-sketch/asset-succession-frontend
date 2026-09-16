from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path.cwd()
OUT = ROOT / ".tmp" / "simple-calculator-proof"
OUT.mkdir(parents=True, exist_ok=True)

CASES = [
    ("desktop", 1440, 1000),
    ("mobile-390", 390, 900),
    ("mobile-360", 360, 900),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, width, height in CASES:
        page = browser.new_page(viewport={"width": width, "height": height})
        page.goto("http://127.0.0.1:4191/calculator", wait_until="networkidle")
        expect(page.get_by_role("heading", name="상속·증여·양도소득세를 사이트 안에서 바로 계산합니다.")).to_be_visible()
        page.get_by_role("button", name="계산하기").click()
        expect(page.get_by_text("예상 납부세액 합계")).to_be_visible()
        page.screenshot(path=str(OUT / f"{name}-inheritance-result.png"), full_page=True)
        page.get_by_role("tab", name="증여세 증여일·관계·10년 공제").click()
        page.get_by_role("button", name="계산하기").click()
        expect(page.get_by_text("4,850,000원").first).to_be_visible()
        page.screenshot(path=str(OUT / f"{name}-gift-result.png"), full_page=True)
        page.get_by_label("증여재산가액").fill("200000000")
        expect(page.get_by_text("다시 계산 필요")).to_be_visible()
        page.get_by_role("button", name="계산하기").click()
        page.get_by_role("button", name="초기화").click()
        expect(page.get_by_text("입력 후 계산하기를 누르세요.")).to_be_visible()
        page.screenshot(path=str(OUT / f"{name}-reset.png"), full_page=True)
        page.close()
    browser.close()
