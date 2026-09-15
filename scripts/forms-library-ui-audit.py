"""Actual production-build audit; no AI/MCP calls or operational writes."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('FORM_LIBRARY_BASE_URL', 'http://127.0.0.1:4188').rstrip('/')
OUT = ROOT / '.tmp/forms-library-proof'
OUT.mkdir(parents=True, exist_ok=True)
LIB = ROOT / 'public/downloads/asset-succession-forms-v1'
URL = '/downloads/asset-succession-forms-v1/'
manifest = json.loads((LIB / '04_사이트등록/forms_manifest.json').read_text(encoding='utf-8'))
checks = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width':1440,'height':1000}, accept_downloads=True)
    old = context.request.get(BASE + URL + 'index.html', max_redirects=0)
    assert old.status in (307,308)
    assert old.headers.get('location') in ('/forms',BASE + '/forms')
    checks.append({'case':'legacy-index-redirect','status':old.status})
    files = []
    for item in manifest['documents']:
        files.extend([(item['editable_file'],item['sha256']),(item['example_file'],item['example_sha256'])])
    for name in ['asset_succession_forms_v1.zip','00_작성예시_모아보기.pdf','03_이용안내/00_먼저읽기_이용안내.pdf']:
        files.append((name,hashlib.sha256((LIB/name).read_bytes()).hexdigest()))
    for name,digest in files:
        response = context.request.get(BASE + URL + quote(name,safe='/'))
        assert response.status == 200,(name,response.status)
        assert hashlib.sha256(response.body()).hexdigest() == digest,name
    checks.append({'case':'original-download-integrity','verified_files':len(files)})

    page = context.new_page()
    errors = []
    page.on('pageerror',lambda error:errors.append(str(error)))
    for width,height in [(320,812),(360,812),(390,844),(768,1024),(1024,1000),(1280,1000),(1440,1000)]:
        page.set_viewport_size({'width':width,'height':height})
        response = page.goto(BASE+'/forms',wait_until='networkidle')
        assert response and response.status == 200
        expect(page.locator('[data-forms-library="approved-v2"]')).to_be_visible()
        expect(page.locator('[data-form-id]')).to_have_count(10)
        assert page.locator('header[data-public-header]').count() == 1
        assert page.locator('[data-prototype-header]').count() == 0
        for image in page.locator('[data-form-preview] img').all():
            image.scroll_into_view_if_needed()
            image.evaluate('(image)=>image.decode()')
            assert image.evaluate('(image)=>image.complete && image.naturalWidth>0')
        page.evaluate('window.scrollTo({top:0,left:0,behavior:"instant"})')
        page.wait_for_function('window.scrollY === 0')
        sizes = page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
        page.screenshot(path=str(OUT/f'library-{width}.png'))
        if width in (390,1440):
            page.screenshot(path=str(OUT/f'library-full-{width}.png'),full_page=True)
        assert sizes['scroll'] <= sizes['width']+1,('horizontal-overflow',width,sizes)
        for element in page.locator('[data-form-download]').all():
            box = element.bounding_box()
            assert box and box['x']>=0 and box['x']+box['width']<=width+1
        checks.append({'case':'responsive','width':width,'height':height,'no_horizontal_overflow':True,'cards':10})

    page.set_viewport_size({'width':390,'height':844})
    for category,count in [('재산분배·상속',2),('증여',4),('차용·상환',2),('양도',1),('가업승계',1),('전체',10)]:
        page.locator(f'button[data-category="{category}"]').click()
        expect(page.locator('[data-form-id]')).to_have_count(count)
    search = page.get_by_role('searchbox',name='서류명·용도로 찾기')
    search.fill('차 용 증')
    expect(page.locator('[data-form-id]')).to_have_count(1)
    expect(page.locator('[data-form-id] h3')).to_have_text('금전소비대차계약서')
    search.fill('검색결과가없는가상단어')
    expect(page.locator('[data-form-id]')).to_have_count(0)
    page.get_by_role('button',name='전체 서류 보기',exact=True).click()
    expect(search).to_have_value('')
    expect(page.locator('[data-form-id]')).to_have_count(10)
    checks.append({'case':'categories-and-search','passed':True})

    opener = page.get_by_role('link',name='가족별 재산배분·정산표 작성 예시 보기',exact=True)
    opener.click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.get_by_role('dialog').get_by_role('heading')).to_have_text('가족별 재산배분·정산표')
    page.screenshot(path=str(OUT/'example-modal-390.png'))
    for _ in range(7):
        page.keyboard.press('Tab')
        assert page.evaluate('document.querySelector("dialog").contains(document.activeElement)')
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).not_to_be_visible()
    expect(opener).to_be_focused()
    assert page.evaluate('document.documentElement.style.overflow') == ''
    checks.append({'case':'modal-focus-trap-and-return','passed':True})

    for formid in ['AS360-F06','AS360-F01']:
        with page.expect_download() as info:
            page.locator(f'[data-form-id="{formid}"] [data-form-download]').click()
        download = info.value
        expected = next(item for item in manifest['documents'] if item['id']==formid)
        assert download.failure() is None
        assert download.suggested_filename == Path(expected['editable_file']).name
        assert hashlib.sha256(Path(download.path()).read_bytes()).hexdigest() == expected['sha256']
    with page.expect_download() as info:
        page.locator('[data-bundle-download]').click()
    assert info.value.failure() is None
    checks.append({'case':'browser-download','word':True,'excel':True,'zip':True,'korean_filename':True})

    page.set_viewport_size({'width':1440,'height':1000})
    page.goto(BASE+'/forms',wait_until='networkidle')
    forms_header = page.locator('header[data-public-header]').evaluate('(e)=>e.outerHTML')
    for route in ['/','/consultation','/sample-report']:
        response = page.goto(BASE+route,wait_until='networkidle')
        assert response and response.status == 200
        assert page.locator('[data-forms-library]').count() == 0
        assert page.locator('header[data-public-header]').evaluate('(e)=>e.outerHTML') == forms_header
    page.goto(BASE+'/',wait_until='networkidle')
    page.locator(f'header a[href="{URL}index.html"]:visible').first.click()
    expect(page).to_have_url(BASE+'/forms')
    expect(page.locator('[data-forms-library]')).to_be_visible()
    checks.append({'case':'existing-header-click-to-library','passed':True})
    checks.append({'case':'home-consultation-sample-header-isolation','passed':True})
    assert not errors,errors
    context.close()
    nojs = browser.new_context(java_script_enabled=False)
    page = nojs.new_page()
    page.goto(BASE+'/forms')
    assert page.locator('[data-form-download]').count() == 10
    checks.append({'case':'server-rendered-downloads-without-js','passed':True})
    nojs.close()
    browser.close()

result = {'base_url':BASE,'source_sha':os.environ.get('GITHUB_SHA'),'checks':checks,
          'real_model_calls':0,'mcp_calls':0,'physical_device_test':False,
          'test_type':'actual local production build' if '127.0.0.1' in BASE else 'deployed URL'}
(OUT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
