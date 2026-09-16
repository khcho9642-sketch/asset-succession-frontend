import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path.cwd()
OUT = ROOT / ".tmp" / "simple-calculator-proof"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:4191"

CASES = [
    ("desktop", 1440, 1000),
    ("mobile-390", 390, 900),
    ("mobile-360", 360, 900),
]


def choose(page, group_name: str, option: str) -> None:
    page.get_by_role("group", name=group_name).locator("label").filter(has_text=option).first.click()


def expect_no_overflow(page, width: int) -> None:
    sizes = page.evaluate("({width: innerWidth, scroll: document.documentElement.scrollWidth})")
    assert sizes["scroll"] <= sizes["width"] + 1, (width, sizes)


def fill_inheritance(page) -> None:
    page.get_by_label("상속개시일").fill("2026-09-16")
    page.get_by_label("지원 가족관계").select_option("spouseChildren")
    page.get_by_label("법정상속 대상 자녀 수").fill("2")
    page.get_by_label("배우자가 실제로 상속받은 금액").fill("500000000")
    page.get_by_label("부동산가액").fill("1200000000")
    expect(page.get_by_label("부동산가액")).to_have_value("1,200,000,000")
    expect(page.get_by_text("12억 원")).to_be_visible()
    page.get_by_label("금융재산가액").fill("200,000,000")
    page.get_by_label("기타재산가액").fill("0")
    choose(page, "퇴직금·보험금·신탁재산 등", "없음")
    choose(page, "비과세·과세가액 불산입액", "없음")
    choose(page, "채무", "있음")
    page.get_by_label("채무 금액").fill("100000000")
    choose(page, "공과금", "없음")
    choose(page, "일반 장례비용", "있음")
    page.get_by_label("일반 장례비용").fill("8000000")
    choose(page, "봉안시설·자연장지 비용", "없음")
    choose(page, "연로자 공제 대상", "없음")
    choose(page, "미성년자 공제 대상", "없음")
    choose(page, "장애인 공제 대상", "없음")
    choose(page, "상속 전 사전증여", "없음")
    choose(page, "배우자 사전증여 과세표준", "없음")


def fill_gift_base(page) -> None:
    page.get_by_role("tab", name="증여세").click()
    page.get_by_label("증여일").fill("2026-09-16")
    page.get_by_label("수증자 거주자 여부").select_option("yes")
    page.get_by_label("증여자와의 관계").select_option("linealAscendantAdult")
    page.get_by_label("증여재산가액").fill("100000000")
    choose(page, "수증자 인수 채무", "없음")
    choose(page, "최근 10년 동일인 관련 증여", "없음")
    choose(page, "최근 10년 사용한 일반 공제", "없음")
    choose(page, "감정평가수수료", "없음")
    choose(page, "혼인·출산 증여재산공제 요건 충족", "없음")
    choose(page, "세대생략 할증 대상", "없음")


def fill_capital_base(page) -> None:
    page.get_by_role("tab", name="양도소득세").click()
    page.get_by_label("취득일").fill("2016-09-15")
    page.get_by_label("양도일").fill("2026-09-16")
    page.get_by_label("자산 종류").select_option("generalBuilding")
    expect(page.get_by_text("보유기간은 만 10년")).to_be_visible()
    page.get_by_label("양도가액").fill("900000000")
    page.get_by_label("취득가액").fill("600000000")
    choose(page, "필요경비", "있음")
    page.get_by_label("필요경비").fill("30000000")
    choose(page, "같은 해 다른 양도소득금액", "없음")
    choose(page, "이미 사용한 양도소득 기본공제", "없음")


with sync_playwright() as p:
    browser = p.chromium.launch()
    results = []
    for name, width, height in CASES:
        page = browser.new_page(viewport={"width": width, "height": height})
        page.goto(f"{BASE}/calculator", wait_until="networkidle")
        expect(page.get_by_role("heading", name="간편 세금계산")).to_be_visible()
        expect(page.get_by_label("부동산가액")).to_have_value("")
        expect(page.get_by_text("입력 후 계산하기를 누르세요.")).to_be_visible()
        expect_no_overflow(page, width)
        page.screenshot(path=str(OUT / f"{name}-after-empty.png"), full_page=True)

        page.get_by_role("button", name="계산하기").click()
        expect(page.get_by_text("부동산가액: 금액을 입력해 주세요. 없으면 0원을 입력해 주세요.")).to_be_visible()
        expect(page.get_by_text("아직 세액을 계산하지 않았습니다.")).to_be_visible()

        page.get_by_role("button", name="예시 불러오기").click()
        expect(page.get_by_text("가상 예시가 입력되었습니다")).to_be_visible()
        page.get_by_role("button", name="계산하기").click()
        expect(page.get_by_text("예상 납부세액")).to_be_visible()
        expect(page.get_by_text("58,588,000원").first).to_be_visible()
        assert page.evaluate("document.activeElement?.className || ''")
        page.screenshot(path=str(OUT / f"{name}-after-example-result.png"), full_page=True)

        page.get_by_label("부동산가액").fill("1300000000")
        expect(page.get_by_text("다시 계산 필요")).to_be_visible()
        expect(page.get_by_text("이전 결과를 현재 세액처럼 표시하지 않습니다.")).to_be_visible()
        page.get_by_role("button", name="계산하기").click()
        expect(page.get_by_text("77,988,000원").first).to_be_visible()
        page.get_by_role("button", name="초기화").click()
        expect(page.get_by_label("부동산가액")).to_have_value("")
        expect(page.get_by_text("가상 예시가 입력되었습니다")).not_to_be_visible()
        expect(page.get_by_text("입력 후 계산하기를 누르세요.")).to_be_visible()

        fill_inheritance(page)
        page.get_by_role("button", name="계산하기").click()
        expect(page.locator("aside strong:visible", has_text="39,188,000원").first).to_be_visible()
        page.get_by_text("상세 계산내역 보기").click()
        expect(page.get_by_text("배우자 상속공제").first).to_be_visible()

        page.get_by_label("기타재산가액").fill("abc")
        expect(page.get_by_text("숫자와 쉼표만 입력할 수 있습니다.")).to_be_visible()
        page.get_by_label("기타재산가액").fill("0")
        page.get_by_role("button", name="계산하기").click()
        expect(page.locator("aside strong:visible", has_text="39,188,000원").first).to_be_visible()

        fill_gift_base(page)
        expect(page.get_by_text("입력 후 계산하기를 누르세요.")).to_be_visible()
        page.get_by_role("button", name="계산하기").click()
        expect(page.get_by_text("4,850,000원").first).to_be_visible()
        choose(page, "수증자 인수 채무", "있음")
        page.get_by_label("인수 채무").fill("50000000")
        expect(page.get_by_text("다시 계산 필요")).to_be_visible()
        page.get_by_role("button", name="계산하기").click()
        expect(page.get_by_text("0원").first).to_be_visible()
        choose(page, "수증자 인수 채무", "없음")
        page.get_by_role("button", name="계산하기").click()
        expect(page.get_by_text("4,850,000원").first).to_be_visible()

        amount = page.get_by_label("증여재산가액")
        amount.fill("1234567")
        expect(amount).to_have_value("1,234,567")
        amount.evaluate("(element) => element.setSelectionRange(2, 2)")
        amount.type("9")
        expect(amount).to_have_value("19,234,567")

        fill_capital_base(page)
        page.get_by_role("button", name="계산하기").click()
        expect(page.get_by_text("67,309,000원").first).to_be_visible()
        page.get_by_role("tab", name="상속세").click()
        expect(page.get_by_label("부동산가액")).to_have_value("1,200,000,000")
        expect(page.locator("aside strong:visible", has_text="39,188,000원").first).to_be_visible()
        expect_no_overflow(page, width)
        page.screenshot(path=str(OUT / f"{name}-after-direct-result.png"), full_page=True)
        results.append({"viewport": name, "width": width, "height": height, "passed": True})
        page.close()
    browser.close()

(OUT / "verification.json").write_text(json.dumps({
    "base_url": BASE,
    "checks": results,
    "before_captures": str(ROOT / ".tmp" / "simple-calculator-before"),
    "after_captures": str(OUT),
    "official_calculator_live_comparison": "not_run",
    "official_basis_checked": [
        "NTS inheritance personal deduction table",
        "NTS gift tax calculation flow and deduction table",
        "NTS capital gains flow, rates and long-term deduction guidance",
    ],
}, ensure_ascii=False, indent=2), encoding="utf-8")
print((OUT / "verification.json").read_text(encoding="utf-8"))
