"""Verify the same deployed public header on every customer-facing route.

Run with PUBLIC_HEADER_BASE_URL pointing at the approved preview deployment.
Uses only empty browser sessions and public sample assets; never calls the AI
POST endpoint or submits contact details. Requires Playwright and Chromium.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".tmp/public-header-proof"
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ["PUBLIC_HEADER_BASE_URL"].rstrip("/")
ROUTES = ["/", "/precheck", "/precheck/form", "/precheck/result", "/sample-report", "/report-preview", "/consultation"]
KAKAO = "https://open.kakao.com/o/ss665WMi"
manifest = json.loads((ROOT / "public/media/sample-report-v3/manifest.json").read_text(encoding="utf-8"))


def read(path: str) -> bytes:
    request = urllib.request.Request(BASE + path, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=30) as response:
        assert response.status == 200
        return response.read()


deadline = time.monotonic() + 240
while True:
    try:
        if all(b"data-public-header" in read(path) for path in ROUTES):
            break
    except Exception as error:
        print("Waiting for the preview:", type(error).__name__, flush=True)
    if time.monotonic() > deadline:
        raise RuntimeError("The shared header was not available on every preview route within 240 seconds")
    time.sleep(10)
print("Shared header found on all seven preview routes", flush=True)

assert len(manifest["pages"]) == 7
for item in manifest["pages"]:
    assert hashlib.sha256(read(item["image"])).hexdigest() == item["sha256"], item["image"]
print("All seven report image hashes match the unchanged manifest", flush=True)

METRICS = """header => {
  const rect = element => {
    const r = element.getBoundingClientRect();
    return Object.fromEntries(['x','y','width','height'].map(key => [key, Math.round(r[key]*100)/100]));
  };
  const style = element => {
    const s = getComputedStyle(element);
    return Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','borderBottomColor'].map(key => [key,s[key]]));
  };
  const links = Array.from(header.querySelectorAll('a')).filter(a => a.getBoundingClientRect().width > 0 && a.getBoundingClientRect().height > 0);
  return {
    header: rect(header), inner: rect(header.querySelector('[data-public-header-inner]')),
    rootStyle: style(header), logo: rect(header.querySelector('[data-public-brand]')),
    logoStyle: style(header.querySelector('[data-public-brand] > span')),
    links: links.map(a => ({label:a.getAttribute('aria-label') || a.textContent.trim(), href:a.getAttribute('href'), target:a.getAttribute('target'), rel:a.getAttribute('rel'), rect:rect(a), style:style(a)}))
  };
}"""
records = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(device_scale_factor=1, reduced_motion="reduce")
    context.route("**/api/diagnosis", lambda route: route.abort() if route.request.method == "POST" else route.continue_())
    page = context.new_page()

    def visit(path: str) -> None:
        response = page.goto(BASE + path, wait_until="networkidle")
        assert response and response.status == 200, path
        expect(page.locator("[data-public-header]")).to_have_count(1)
        page.evaluate("document.fonts.ready")
        # Desktop and mobile variants are both in the DOM. A hidden lazy image
        # need not load or decode until its breakpoint makes it visible.
        page.wait_for_function("Array.from(document.querySelectorAll('[data-public-header] img')).filter(i => i.getBoundingClientRect().width > 0).every(i => i.complete && i.naturalWidth > 0)", timeout=15000)
        page.mouse.move(0, 0)

    for width in [1440, 1024, 768, 375, 320]:
        page.set_viewport_size({"width": width, "height": 1000 if width >= 768 else 812})
        reference = None
        for path in ROUTES:
            print(f"Checking {width}px {path}", flush=True)
            visit(path)
            header = page.locator("[data-public-header]")
            metrics = header.evaluate(METRICS)
            slug = path.strip("/").replace("/", "-") or "home"
            shot = header.screenshot(path=str(OUT / f"header-{slug}-{width}.png"), animations="disabled")
            if reference is None:
                reference = metrics
            assert metrics == reference, json.dumps({"route":path,"width":width,"expected":reference,"actual":metrics}, ensure_ascii=False)
            assert metrics["header"]["y"] == 0
            assert metrics["header"]["height"] == (97 if width >= 1024 else 73)
            for link in metrics["links"]:
                box = link["rect"]
                assert box["x"] >= -1 and box["x"] + box["width"] <= width + 1, (path, width, link)
            kakao = [link for link in metrics["links"] if link["href"] == KAKAO]
            assert len(kakao) == 1 and kakao[0]["target"] == "_blank"
            assert {"noopener", "noreferrer"}.issubset(set(kakao[0]["rel"].split()))
            expert = next(link for link in metrics["links"] if link["href"] == "/consultation")
            assert kakao[0]["rect"]["x"] < expert["rect"]["x"], "Kakao must stay to the left of expert consultation"
            if width >= 1024:
                assert [link["label"] for link in metrics["links"]][1:5] == ["양도", "상속", "증여", "가업승계"]
            records.append({"route":path,"width":width,"metrics":metrics,"header_image_sha256":hashlib.sha256(shot).hexdigest()})
            (OUT / "progress.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
            if path in ["/", "/precheck", "/sample-report"] and width in [1440, 375]:
                page.screenshot(path=str(OUT / f"page-{slug}-{width}.png"), animations="disabled")

    print("All 35 header comparisons passed; checking report controls", flush=True)
    page.set_viewport_size({"width":1440,"height":1000})
    visit("/sample-report")
    viewer = page.locator("[data-sample-viewer]")
    expect(page.locator('[data-sample-document][data-fitted="true"]')).to_have_count(1)
    expect(viewer).to_have_attribute("data-current-page", "1")
    cover = page.locator('[data-report-page="1"] img')
    assert cover.get_attribute("src") == manifest["pages"][0]["image"]
    first = cover.bounding_box()
    assert first and first["y"] >= 97 and first["y"] + first["height"] <= 1000 + 1
    expect(page.get_by_role("link", name="PDF 저장", exact=True)).to_have_attribute("href", manifest["pdf"])
    for number in range(2, 8):
        page.get_by_role("button", name="다음 페이지", exact=True).click()
        expect(viewer).to_have_attribute("data-current-page", str(number))
        image = page.locator(f'[data-report-page="{number}"] img')
        assert image.get_attribute("src") == manifest["pages"][number-1]["image"]
        bounds = image.bounding_box()
        assert bounds and abs(bounds["width"] - first["width"]) < 1 and abs(bounds["height"] - first["height"]) < 1
    page.get_by_role("button", name="크게 보기", exact=True).click()
    expect(viewer).to_have_attribute("data-expanded", "true")
    assert viewer.bounding_box()["height"] == 1000
    page.get_by_role("button", name="기본 화면", exact=True).click()
    expect(viewer).to_have_attribute("data-expanded", "false")

    page.set_viewport_size({"width":375,"height":812})
    visit("/sample-report")
    page.get_by_role("button", name="메뉴 열기", exact=True).click()
    menu = page.locator("#mobile-diagnosis-menu")
    expect(menu).to_be_visible()
    assert menu.get_by_role("link", name="양도", exact=True).evaluate("e => { const r=e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }")
    page.keyboard.press("Escape")
    expect(menu).to_be_hidden()
    expect(page.get_by_role("button", name="메뉴 열기", exact=True)).to_be_focused()
    page.locator('[data-public-header] a[href="/consultation"]:visible').click()
    expect(page).to_have_url(BASE + "/consultation")
    expect(page.locator('a[href="tel:01089309642"]')).to_be_visible()
    expect(page.locator('a[href="mailto:khcho@hangilac.co.kr"]')).to_be_visible()
    page.emulate_media(media="print")
    expect(page.locator("[data-public-header]")).to_be_hidden()
    browser.close()

summary = {"preview_url":BASE,"route_count":len(ROUTES),"viewport_widths":[1440,1024,768,375,320],"checks":len(records),"identical_header_geometry_and_typography":True,"report_page_images_unchanged":True,"report_navigation_and_fullscreen":True,"pdf_link_preserved":True,"mobile_menu_layer_and_escape":True,"contact_links_preserved":True,"no_ai_post_or_contact_submission":True,"records":records}
(OUT / "verification.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({key:value for key,value in summary.items() if key != "records"}, ensure_ascii=False, indent=2))
