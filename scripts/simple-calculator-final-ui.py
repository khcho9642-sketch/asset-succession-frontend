"""Actual browser acceptance, using the unchanged independent fixture."""
import json
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path.cwd()
BASE = os.environ.get("CALCULATOR_BASE_URL", "http://127.0.0.1:4191").rstrip("/")
BEFORE = os.environ.get("CALCULATOR_BASELINE") == "1"
OUT = ROOT / ".tmp" / "simple-calculator-proof" / ("final-before" if BEFORE else "final-after")
OUT.mkdir(parents=True, exist_ok=True)
CASES = json.loads((ROOT / "docs/reviews/calculator-final-cases-2026-09-19.json").read_text(encoding="utf-8"))["cases"]


def field(page, name):
    return page.locator(f'[name="{name}"]')


def fill(page, name, value):
    field(page, name).fill(str(value))


def select(page, name, value):
    field(page, name).select_option(value)


def choose(page, name, value):
    radio = page.locator(f'[name="{name}"][value="{value}"]')
    # Exercise keyboard access; the existing audit separately clicks the labels.
    # This avoids an in-flight smooth-scroll moving a custom radio's click target.
    radio.focus()
    radio.press("Space")
    expect(radio).to_be_checked()


def optional(page, status, name, amount):
    choose(page, status, "yes" if amount else "no")
    if amount:
        fill(page, name, amount)


def populate(page, c):
    i, facts = c["input"], c["facts"]
    page.get_by_role("tab", name={"gift": "증여세", "inheritance": "상속세", "capitalGains": "양도소득세"}[c["kind"]]).click()
    page.get_by_role("button", name="초기화").click()
    expect(page.get_by_text("입력 후 계산하기를 누르세요.")).to_be_visible()
    if c["kind"] == "gift":
        fill(page, "giftDate", i["giftDate"])
        select(page, "resident", i["resident"])
        select(page, "relationship", i["relationship"])
        fill(page, "amountWon", i["amountWon"])
        optional(page, "debtStatus", "debtAssumedWon", i["debtAssumedWon"])
        optional(page, "priorGiftStatus", "priorGiftWon", i["priorGiftWon"])
        if i["priorGiftWon"]:
            fill(page, "priorGiftDeductionWon", i["priorGiftDeductionWon"])
            choose(page, "previousTaxKnown", "yes")
            fill(page, "previousTaxPaidWon", i["previousTaxPaidWon"])
            if not BEFORE:
                choose(page, "priorGiftMarriageBirthStatus", i["priorGiftMarriageBirthStatus"])
                if i["priorGiftMarriageBirthStatus"] == "yes":
                    assert facts["donor"] == "same_father"
                    select(page, "priorGiftDonor", "sameFather")
                    fill(page, "priorGiftDate", facts["priorGiftDate"])
                    select(page, "priorGiftMarriageBirthEvent", "marriage")
                    fill(page, "priorGiftMarriageBirthEventDate", facts["priorMarriageDate"])
                    fill(page, "priorGiftMarriageBirthAppliedWon", i["priorGiftMarriageBirthAppliedWon"])
                    fill(page, "priorGiftTaxableBaseWon", i["priorGiftTaxableBaseWon"])
                    select(page, "priorGiftHistoryConfirmed", "yes" if facts["priorDeductionRemainsLegallyValid"] else "no")
                    select(page, "ordinaryCashHistory", "yes" if i["ordinaryCashHistory"] else "no")
        optional(page, "otherGiftDeductionStatus", "otherGiftDeductionWon", i["otherGiftDeductionWon"])
        optional(page, "appraisalStatus", "appraisalFeeWon", i["appraisalFeeWon"])
        choose(page, "marriageBirthStatus", "yes" if i["marriageBirthDeductionWon"] else "no")
        if i["marriageBirthDeductionWon"]:
            select(page, "marriageBirthEvent", i["marriageBirthEvent"])
            fill(page, "marriageBirthEventDate", i["marriageBirthEventDate"])
        if i["marriageBirthDeductionWon"] or (not BEFORE and i["priorGiftMarriageBirthStatus"] == "yes"):
            optional(page, "marriageBirthUsedStatus", "marriageBirthPreviouslyUsedWon", i["marriageBirthPreviouslyUsedWon"])
        choose(page, "generationSkipStatus", "no")
    elif c["kind"] == "inheritance":
        fill(page, "deathDate", i["deathDate"])
        select(page, "familyType", "spouseChildren" if i["spouse"] == "yes" else "childrenOnly")
        fill(page, "childrenCount", i["childrenCount"])
        if i["spouse"] == "yes":
            fill(page, "spouseActualInheritanceWon", i["spouseActualInheritanceWon"])
        for key in ["realEstateWon", "financialAssetsWon", "otherAssetsWon"]:
            fill(page, key, i[key])
        if i["financialAssetsWon"]:
            optional(page, "financialExclusionsStatus", "financialExclusionsWon", i["financialExclusionsWon"])
        parts = i["deemedAssetBreakdown"]
        choose(page, "deemedAssetsStatus", "yes" if parts else "no")
        if parts:
            if BEFORE:
                fill(page, "deemedAssetsWon", sum(part["estateIncludedWon"] for part in parts))
            else:
                for kind in ["insurance", "retirement", "moneyTrust", "other"]:
                    part = next((x for x in parts if x["kind"] == kind), None)
                    choose(page, kind + "Status", "yes" if part else "no")
                    if part:
                        select(page, kind + "Classification", part["classification"])
                        fill(page, kind + "Included", part["estateIncludedWon"])
                        if kind != "retirement":
                            fill(page, kind + "Eligible", part["financialEligibleWon"])
        for status, name in [("nonTaxableStatus", "nonTaxableWon"), ("debtStatus", "debtWon"), ("publicChargesStatus", "publicChargesWon"), ("funeralStatus", "funeralWon"), ("burialStatus", "burialWon")]:
            optional(page, status, name, i[name])
        if i["debtWon"]:
            fill(page, "financialDebtWon", i["financialDebtWon"])
        for status in ["seniorStatus", "minorStatus", "disabledStatus"]:
            choose(page, status, "no")
        choose(page, "priorGiftStatus", "yes" if i["priorGifts"] else "no")
        if i["priorGifts"]:
            fill(page, "priorGiftCount", len(i["priorGifts"]))
            for n, past in enumerate(i["priorGifts"]):
                prefix = f"priorGift{n}"
                select(page, prefix + "Recipient", past["recipient"])
                select(page, prefix + "Kind", past["propertyKind"])
                select(page, prefix + "Eligible", past["creditEligible"])
                for suffix, key in [("Amount", "amountWon"), ("Base", "taxableBaseWon"), ("Tax", "calculatedTaxWon")]:
                    fill(page, prefix + suffix, past[key])
    else:
        for key in ["acquisitionDate", "transferDate", "salePriceWon", "purchasePriceWon"]:
            fill(page, key, i[key])
        select(page, "resident", i["resident"])
        select(page, "assetType", i["assetType"])
        optional(page, "expenseStatus", "necessaryExpenseWon", i["necessaryExpenseWon"])
        choose(page, "otherGainStatus", "yes" if i["annualAggregation"] else "no")
        if i["annualAggregation"]:
            select(page, "otherGainDirection", "loss" if i["otherCapitalGainWon"] < 0 else "profit")
            fill(page, "otherCapitalGainWon", abs(i["otherCapitalGainWon"]))
            select(page, "otherGainsGeneralRate", i["otherGainsGeneralRate"])
            choose(page, "previousCapitalTaxStatus", "yes")
            fill(page, "previousNationalTaxWon", i["previousNationalTaxWon"])
            fill(page, "previousLocalTaxWon", i["previousLocalTaxWon"])
        optional(page, "basicDeductionStatus", "basicDeductionUsedWon", i["basicDeductionUsedWon"])
        if i["assetType"] == "oneHome":
            fill(page, "homeCount", i["homeCount"])
            select(page, "homeOwnership", i["homeOwnership"])
            optional(page, "residenceStatus", "residenceYears", i["residenceYears"])
            for key in ["householdOtherRights", "regulatedAtAcquisition", "homeSpecialConditions"]:
                choose(page, key, i[key])


def calculate(page, expected):
    page.get_by_role("button", name="계산하기").click()
    expect(page.get_by_text("계산 완료", exact=True)).to_be_visible()
    expect(page.locator("aside > strong")).to_have_text(f"{expected:,}원")
    expect(page.locator("[data-result-title]")).to_be_focused()
    page.wait_for_function("() => { const r = document.querySelector('[data-result-title]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }", timeout=10_000)
    box = page.locator("[data-result-title]").bounding_box()
    assert box and 0 <= box["y"] < page.viewport_size["height"]


def stale(page):
    expect(page.get_by_text("다시 계산 필요", exact=True)).to_be_visible()
    expect(page.locator("aside > strong")).to_have_count(0)
    expect(page.get_by_text("계산 완료", exact=True)).not_to_be_visible()


def blocked(page, name):
    page.get_by_role("button", name="계산하기").click()
    expect(page.get_by_text("계산 완료", exact=True)).not_to_be_visible()
    expect(page.get_by_text("아직 세액을 계산하지 않았습니다.")).to_be_visible()
    expect(field(page, name).first).to_be_focused()


def details(page, c):
    panel = page.locator("aside details").filter(has=page.get_by_text("상세 계산내역 보기", exact=True))
    panel.locator("summary").click()
    rows = panel.locator("div > div").evaluate_all("els => els.filter(e => e.querySelector(':scope > strong')).map(e => ({label:e.querySelector(':scope > span').childNodes[0].textContent, value:e.querySelector(':scope > strong').textContent}))")
    (OUT / f'{c["id"]}-details-{page.viewport_size["width"]}.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    mapped = {
        "aggregateGiftWon": ("합산 증여 과세가액", 1), "appliedBasicDeductionWon": ("직계존속", -1),
        "preservedPriorMarriageBirthWon": ("합산 과거 혼인", -1), "newMarriageBirthDeductionWon": ("혼인·출산 추가", -1),
        "aggregateGrossTaxWon": ("합산 산출세액", 1), "filingCreditWon": ("신고세액공제", -1),
        "totalAssetsWon": ("총 상속재산", 1), "taxableEstateWon": ("상속세 과세가액", 1),
        "netFinancialWon": ("공제 대상 순금융재산", 1), "financialDeductionWon": ("금융재산 상속공제", -1),
        "gainWon": ("양도차익", 1), "taxableGainWon": ("과세대상 양도차익", 1), "longTermDeductionWon": ("장기보유특별공제", -1),
        "capitalIncomeWon": ("공제 후 양도소득금액", 1), "basicDeductionWon": ("양도소득 기본공제", -1),
        "annualNationalTaxWon": ("기납부 차감 전 국세", 1), "annualLocalTaxWon": ("개인지방소득세 산출세액", 1), "taxableBaseWon": ("과세표준", 1),
        "priorTaxCreditWon": ("종전 증여" if c["kind"] == "gift" else "사전증여 증여세액공제", -1),
    }
    for key, (prefix, sign) in mapped.items():
        if key not in c["expected"]:
            continue
        row = next(x for x in rows if x["label"].startswith(prefix))
        observed = int(row["value"].replace(",", "").replace("원", "")) * sign
        assert observed == c["expected"][key], (c["id"], key, observed, c["expected"][key])


results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in [int(w) for w in os.environ.get("CALCULATOR_TEST_WIDTHS", "1440,390,360").split(",") if w]:
        page = browser.new_page(viewport={"width": width, "height": 1000 if width == 1440 else 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "/calculator", wait_until="networkidle")
        expect(field(page, "realEstateWon")).to_have_value("")
        expect(field(page, "familyType")).to_have_value("")
        page.screenshot(path=str(OUT / f"{width}-empty.png"))
        assert field(page, "deathDate").bounding_box()["y"] < page.viewport_size["height"]
        for c in CASES:
            if BEFORE and c["id"] not in ["G01", "I01"]:
                continue
            populate(page, c)
            expected = {"G01": 29_100_000, "I01": 144_045_000}[c["id"]] if BEFORE else c["expected"]["totalTaxWon"]
            calculate(page, expected)
            if not BEFORE:
                details(page, c)
                if c["kind"] == "capitalGains":
                    labels = ["차가감 양도소득세 (국세)", "차가감 지방소득세"] if c["input"]["annualAggregation"] else ["양도소득세 (국세)", "지방소득세"]
                    for label, key in zip(labels, ["nationalTaxWon", "localTaxWon"]):
                        expect(page.locator("aside dl > div").filter(has=page.get_by_text(label, exact=True)).locator("dd")).to_have_text(f'{c["expected"][key]:,}원')
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            page.screenshot(path=str(OUT / f'{width}-{c["id"]}-result.png'), full_page=True)
            if not BEFORE and c["id"] in ["G01", "I01"]:
                # Edit, re-calculate, unknown/unsupported block, restore hidden values.
                is_gift = c["id"] == "G01"
                amount = "amountWon" if is_gift else "realEstateWon"
                fill(page, amount, c["input"][amount] + 100_000_000)
                stale(page)
                calculate(page, 29_100_000 if is_gift else 161_505_000)
                fill(page, amount, c["input"][amount])
                calculate(page, expected)
                if is_gift:
                    choose(page, "priorGiftMarriageBirthStatus", "unknown")
                    stale(page)
                    blocked(page, "priorGiftMarriageBirthStatus")
                    choose(page, "priorGiftMarriageBirthStatus", "yes")
                    expect(field(page, "priorGiftMarriageBirthAppliedWon")).to_have_value("100,000,000")
                    select(page, "priorGiftHistoryConfirmed", "unknown")
                    blocked(page, "priorGiftHistoryConfirmed")
                    select(page, "priorGiftHistoryConfirmed", "no")
                    blocked(page, "priorGiftMarriageBirthStatus")
                    select(page, "priorGiftHistoryConfirmed", "yes")
                    choose(page, "priorGiftStatus", "no")
                    calculate(page, 4_850_000)
                    choose(page, "priorGiftStatus", "yes")
                    expect(field(page, "priorGiftWon")).to_have_value("150,000,000")
                else:
                    select(page, "insuranceClassification", "unknown")
                    stale(page)
                    blocked(page, "insuranceClassification")
                    select(page, "insuranceClassification", "unsupported")
                    blocked(page, "insuranceClassification")
                    select(page, "insuranceClassification", "confirmed")
                    fill(page, "insuranceEligible", 200_000_001)
                    blocked(page, "insuranceEligible")
                    fill(page, "insuranceEligible", 200_000_000)
                    choose(page, "deemedAssetsStatus", "no")
                    calculate(page, 86_330_000)
                    choose(page, "deemedAssetsStatus", "yes")
                    expect(field(page, "insuranceIncluded")).to_have_value("200,000,000")
                calculate(page, expected)
                page.get_by_role("button", name="초기화").click()
                expect(field(page, amount)).to_have_value("")
                expect(page.get_by_text("입력 후 계산하기를 누르세요.")).to_be_visible()
                choose(page, "priorGiftStatus" if is_gift else "deemedAssetsStatus", "yes")
                if is_gift:
                    choose(page, "priorGiftMarriageBirthStatus", "yes")
                    expect(field(page, "priorGiftMarriageBirthAppliedWon")).to_have_value("")
                else:
                    choose(page, "insuranceStatus", "yes")
                    expect(field(page, "insuranceIncluded")).to_have_value("")
            if not BEFORE and c["id"] == "C02":
                fill(page, "previousNationalTaxWon", 100_000_000)
                fill(page, "previousLocalTaxWon", 0)
                stale(page)
                calculate(page, 9_406_000)
                expect(page.get_by_text("추가 납부·환급 차액 (국세 + 지방소득세)", exact=True)).to_be_visible()
                for label, amount in [("차가감 양도소득세 (국세)", "-540,000원"), ("차가감 지방소득세", "9,946,000원")]:
                    expect(page.locator("aside dl > div").filter(has=page.get_by_text(label, exact=True)).locator("dd")).to_have_text(amount)
            results.append({"width": width, "case": c["id"], "tax": expected, "passed": True})
            print(f'{width} {c["id"]}: PASS', flush=True)
        assert errors == [], errors
        page.close()
    if not BEFORE:
        page = browser.new_page(viewport={"width": 320, "height": 900})
        page.goto(BASE + "/calculator", wait_until="networkidle")
        for c in [CASES[0], next(c for c in CASES if c["id"] == "I01")]:
            populate(page, c)
            calculate(page, c["expected"]["totalTaxWon"])
            page.screenshot(path=str(OUT / f'320-{c["id"]}-smoke.png'), full_page=True)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), page.evaluate("({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80),right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>innerWidth+1).slice(0,25)})")
        page.screenshot(path=str(OUT / "320-smoke.png"), full_page=True)
        page.close()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        for label, path in [("간편계산기", "/calculator"), ("서류양식", "/forms"), ("전문가 상담", "/consultation")]:
            page.goto(BASE + "/", wait_until="networkidle")
            page.locator("header").get_by_role("link", name=label, exact=True).first.click()
            page.wait_for_url(BASE + path)
        page.close()
    browser.close()
(OUT / "verification.json").write_text(json.dumps({"base_url": BASE, "baseline": BEFORE, "viewport_emulation_not_physical_device": True, "hometax_executed": False, "checks": results}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"passed": len(results), "base_url": BASE, "proof": str(OUT)}, ensure_ascii=False))
