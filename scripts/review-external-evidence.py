"""Read-only source and baseline checks. Never call our chat/MCP endpoints."""
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
OUT = ROOT / ".tmp/review-external-proof"
OUT.mkdir(parents=True, exist_ok=True)
BASELINE = "https://frontend-prototype-u6rbolnbs-khcho98-6477s-projects.vercel.app"
results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context()
    page = context.new_page()
    for width, height in [(1440,1000),(390,900),(360,900)]:
        page.set_viewport_size({"width":width,"height":height})
        response = page.goto(BASELINE + "/calculator", wait_until="networkidle")
        assert response.status == 200
        assert page.get_by_role("heading", name="간편 세금계산").count() == 1
        page.screenshot(path=str(OUT/f"before-calculator-{width}.png"))
        page.get_by_role("button",name="예시 불러오기").click()
        page.get_by_role("button",name="계산하기").click()
        page.get_by_text("58,588,000원").first.wait_for()
        page.screenshot(path=str(OUT/f"before-calculator-result-{width}.png"),full_page=True)
    target = "https://mob.tbht.hometax.go.kr/jsonAction.do?actionId=UTBRNAAM02F001"
    try:
        response = page.goto(target, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(4000)
        body = page.locator("body").inner_text()
        results.append({"url":target,"status":response.status if response else None,
                        "body":body[:2500],"input_count":page.locator("input").count(),
                        "live_result_comparison":"not_run"})
        page.screenshot(path=str(OUT/"hometax-access.png"),full_page=True)
    except Exception as error:
        results.append({"url":target,"error":str(error),"live_result_comparison":"not_run"})
    sources = json.loads((ROOT/"public/downloads/official-forms/manifest.json").read_text(encoding="utf-8"))
    for url in sorted({item["sourceUrl"] for item in sources["documents"]}):
        try:
            response = context.request.get(url,timeout=30000)
            results.append({"url":url,"status":response.status,"bytes":len(response.body()),
                            "sha256":hashlib.sha256(response.body()).hexdigest()})
        except Exception as error:
            results.append({"url":url,"error":str(error)})
    browser.close()
(OUT/"verification.json").write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(results,ensure_ascii=False,indent=2))
