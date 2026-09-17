"""Actual production-build audit; no AI/MCP calls or operational writes."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote, urlparse, unquote
import io
import zipfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('FORM_LIBRARY_BASE_URL', 'http://127.0.0.1:4188').rstrip('/')
OUT = ROOT / '.tmp/forms-library-proof'
OUT.mkdir(parents=True, exist_ok=True)
LIB = ROOT / 'public/downloads/official-forms'
URL = '/downloads/asset-succession-forms-v1/'
manifest = json.loads((LIB / 'manifest.json').read_text(encoding='utf-8'))
catalog = json.loads((ROOT / 'docs/reviews/official_forms_catalog_candidates.json').read_text(encoding='utf-8-sig'))
expected_ids = sorted(item['id'] for item in catalog['records'])
assert len(expected_ids) == len(set(expected_ids)) == 74
assert sorted(item['id'] for item in manifest['documents']) == expected_ids
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
        if item['delivery'] == 'hosted':
            files.extend([(file['path'],file['sha256']) for file in item['files']])
    assert len(files) == 139
    for path,digest in files:
        response = context.request.get(BASE + path)
        assert response.status == 200,(path,response.status)
        assert response.body().startswith((bytes.fromhex('d0cf11e0a1b11ae1'),b'%PDF-',b'HWP Document File V3.00',b'{\\rtf1'))
        assert hashlib.sha256(response.body()).hexdigest() == digest,path
        assert hashlib.sha256((ROOT / 'public' / unquote(path).lstrip('/')).read_bytes()).hexdigest() == digest
    bundle = context.request.get(BASE + '/downloads/official-forms/official-forms.zip')
    assert bundle.status == 200
    with zipfile.ZipFile(io.BytesIO(bundle.body())) as archive:
        assert len(archive.namelist()) == 141
        assert json.loads(archive.read('manifest.json')) == manifest
        assert '74개 전부를 담은 묶음은 아닙니다' in archive.read('README.md').decode('utf-8')
        for path,digest in files:
            assert hashlib.sha256(archive.read(unquote(path).removeprefix('/downloads/official-forms/'))).hexdigest() == digest
    retired = json.loads((ROOT/'docs/reviews/retired-form-paths.json').read_text(encoding='utf-8'))
    for path in retired:
        if path.endswith('/index.html'):
            continue
        response = context.request.get(BASE + quote(path, safe='/'), max_redirects=0)
        assert response.status in (404,410),(path,response.status)
    checks.append({'case':'institutional-original-download-integrity','verified_files':len(files),'retired_urls':len(retired)-1})

    page = context.new_page()
    errors = []
    page.on('pageerror',lambda error:errors.append(str(error)))
    for width,height in [(320,812),(360,812),(390,844),(768,1024),(1024,1000),(1280,1000),(1440,1000)]:
        page.set_viewport_size({'width':width,'height':height})
        response = page.goto(BASE+'/forms',wait_until='networkidle')
        assert response and response.status == 200
        expect(page.locator('[data-forms-library="institutional-v1"]')).to_be_visible()
        expect(page.locator('[data-form-id]')).to_have_count(74)
        assert sorted(page.locator('[data-form-id]').evaluate_all('(items)=>items.map(item=>item.dataset.formId)')) == expected_ids
        expect(page.locator('[data-catalog-summary]')).to_contain_text('전체 74개 자료')
        expect(page.locator('[data-catalog-summary]')).to_contain_text('사이트 다운로드 70 · 국세청 파일 직접 받기 3 · 파일 미확보 1')
        bundle_summary = page.locator('[data-forms-bundle]')
        expect(bundle_summary).not_to_contain_text('부평구청')
        expect(bundle_summary).not_to_contain_text('HWP')
        expect(bundle_summary).not_to_contain_text('ZIP')
        expect(bundle_summary.locator('[data-bundle-download]')).to_have_text('70개 자료 한번에 받기')
        expect(bundle_summary).to_contain_text('국세청 사례 3개는 개별 다운로드, 웹 사례 1개는 파일 미확보')
        for formid in ['BP-I-01', 'BP-G-01']:
            expect(page.locator(f'[data-form-id="{formid}"]')).to_contain_text('부평구청')
        guides = page.locator('[data-official-registration-guides]')
        expect(guides.locator('[data-registration-guide]')).to_have_count(4)
        expect(guides.locator('a')).to_have_count(8)
        for link in guides.locator('a').all():
            href = link.get_attribute('href')
            parsed = urlparse(href)
            assert parsed.scheme == 'https' and parsed.netloc in ('easylaw.go.kr','www.easylaw.go.kr')
            assert link.get_attribute('target') == '_blank'
            assert {'noopener','noreferrer'} <= set((link.get_attribute('rel') or '').split())
            assert link.get_attribute('download') is None
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
            page.locator('[data-result-count]').scroll_into_view_if_needed()
            page.screenshot(path=str(OUT/f'library-catalog-{width}.png'))
        assert sizes['scroll'] <= sizes['width']+1,('horizontal-overflow',width,sizes)
        for element in page.locator('[data-form-download]').all():
            box = element.bounding_box()
            assert box and box['x']>=0 and box['x']+box['width']<=width+1
        clipped = page.locator('[data-form-id] h3').evaluate_all('(items)=>items.filter(item=>item.scrollWidth>item.clientWidth+1).map(item=>item.textContent)')
        assert not clipped,('clipped-titles',width,clipped)
        checks.append({'case':'responsive','width':width,'height':height,'no_horizontal_overflow':True,'cards':74})

    page.set_viewport_size({'width':390,'height':844})
    for category,count in [('재산분배·상속',10),('증여',3),('매매·임대차',21),('차용·상환',10),('양도',16),('가업승계',3),('공제·납부',5),('등기',6),('전체',74)]:
        page.locator(f'button[data-category="{category}"]').click()
        expect(page.locator('[data-form-id]')).to_have_count(count)
    search = page.get_by_role('searchbox',name='서류명·용도로 찾기')
    search.fill('차 용 증')
    expect(page.locator('[data-form-id]')).to_have_count(2)
    assert set(page.locator('[data-form-id]').evaluate_all('(items)=>items.map(item=>item.dataset.formId)')) == {'SC-30','SC-31'}
    search.fill('개인지방소득세')
    expect(page.locator('[data-form-id]')).to_have_count(1)
    expect(page.locator('[data-form-id="NTS-CG-15"]')).to_be_visible()
    search.fill('동대문구')
    expect(page.locator('[data-form-id]')).to_have_count(1)
    expect(page.locator('[data-form-id="DD-G-01"]')).to_be_visible()
    search.fill('검색결과가없는가상단어')
    expect(page.locator('[data-form-id]')).to_have_count(0)
    page.get_by_role('button',name='전체 서류 보기',exact=True).click()
    expect(search).to_have_value('')
    expect(page.locator('[data-form-id]')).to_have_count(74)
    status = page.get_by_role('combobox',name='자료 제공 상태')
    for value,count in [('hosted',70),('direct',3),('pending',1),('all',74)]:
        status.select_option(value)
        expect(page.locator('[data-form-id]')).to_have_count(count)
    page.locator('button[data-category="증여"]').click()
    status.select_option('hosted')
    expect(page.locator('[data-form-id]')).to_have_count(3)
    search.fill('동대문구')
    expect(page.locator('[data-form-id]')).to_have_count(1)
    search.fill('없는서류')
    page.get_by_role('button',name='전체 서류 보기',exact=True).click()
    expect(status).to_have_value('all')
    expect(page.locator('[data-form-id]')).to_have_count(74)
    for item in manifest['documents']:
        card = page.locator(f'[data-form-id="{item["id"]}"]')
        expect(card.locator('[data-verification-status]')).to_have_text({'hosted':'사이트에서 다운로드','direct':'국세청 파일 바로 받기','pending':'파일 미확보'}[item['delivery']])
        if item['delivery'] == 'pending':
            expect(card.locator('[data-form-download]')).to_have_count(0)
            expect(card.get_by_text('다운로드 미제공',exact=True)).to_be_visible()
            continue
        action = card.locator('[data-form-download]')
        assert action.get_attribute('href') == item['editable'],item['id']
        if item['delivery'] == 'direct':
            assert action.get_attribute('download') is None,item['id']
            assert urlparse(action.get_attribute('href')).path == '/comm/nttFileDownload.do'
    checks.append({'case':'full-catalog-status-and-links','candidate_ids':74,'hosted':70,'direct':3,'pending':1,'passed':True})
    checks.append({'case':'categories-and-search','passed':True})
    checks.append({'case':'official-registration-guides','cards':4,'official_links':8,'new_tab':True})

    opener = page.get_by_role('link',name='상속재산분할협의서 기관 작성 예시 보기',exact=True)
    opener.click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.get_by_role('dialog').get_by_role('heading')).to_have_text('상속재산분할협의서')
    page.screenshot(path=str(OUT/'example-modal-390.png'))
    for _ in range(7):
        page.keyboard.press('Tab')
        assert page.evaluate('document.querySelector("dialog").contains(document.activeElement)')
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).not_to_be_visible()
    expect(opener).to_be_focused()
    page.wait_for_function('document.documentElement.style.overflow === ""',timeout=5000)
    checks.append({'case':'modal-focus-trap-and-return','passed':True})

    for formid in ['BP-I-01','BP-G-01','SC-01','FAMILY-I-01','DD-G-01','NTS-IG-10','NTS-CG-15','REG-I-01']:
        with page.expect_download() as info:
            page.locator(f'[data-form-id="{formid}"] [data-form-download]').click()
        download = info.value
        expected = next(item for item in manifest['documents'] if item['id']==formid)
        assert download.failure() is None
        assert download.suggested_filename == Path(unquote(expected['editable'])).name
        assert hashlib.sha256(Path(download.path()).read_bytes()).hexdigest() == expected['sha256']
    with page.expect_download() as info:
        page.locator('[data-bundle-download]').click()
    assert info.value.failure() is None
    checks.append({'case':'browser-download','institutional_files':8,'zip':True,'korean_filename':True})
    page.locator('[data-form-id="SC-01"] [data-form-preview]').click()
    expect(page.get_by_role('dialog').locator('[data-file-download]')).to_have_count(3)
    court = next(item for item in manifest['documents'] if item['id']=='SC-01')
    for file in court['files']:
        with page.expect_download() as info:
            page.get_by_role('dialog').locator('[data-file-download]').filter(has_text=file['name']).click()
        assert info.value.failure() is None
        assert hashlib.sha256(Path(info.value.path()).read_bytes()).hexdigest() == file['sha256']
    page.keyboard.press('Escape')
    checks.append({'case':'court-format-picker-downloads','formats':['HWP','DOC','PDF'],'hash_match':True})
    if os.environ.get('FORMS_VERIFY_EXTERNAL_DOWNLOADS') == '1':
        for item in [item for item in manifest['documents'] if item['delivery']=='direct']:
            with page.expect_download(timeout=60000) as info:
                page.locator(f'[data-form-id="{item["id"]}"] [data-form-download]').click()
            assert info.value.failure() is None
            assert hashlib.sha256(Path(info.value.path()).read_bytes()).hexdigest() == item['sha256']
            expect(page).to_have_url(BASE+'/forms')
        checks.append({'case':'official-attachment-browser-download','files':3,'provider_page_bypassed':True})
    else:
        checks.append({'case':'official-attachment-browser-download','status':'not run: enable FORMS_VERIFY_EXTERNAL_DOWNLOADS for live agency access'})

    page.set_viewport_size({'width':1440,'height':1000})
    page.goto(BASE+'/forms',wait_until='networkidle')
    forms_header = page.locator('header[data-public-header]').evaluate('(e)=>e.outerHTML')
    for route in ['/','/consultation','/sample-report']:
        response = page.goto(BASE+route,wait_until='networkidle')
        assert response and response.status == 200
        assert page.locator('[data-forms-library]').count() == 0
        assert page.locator('header[data-public-header]').evaluate('(e)=>e.outerHTML') == forms_header
    page.goto(BASE+'/consultation',wait_until='networkidle')
    assert page.locator('input[type="tel"],form').count() == 0
    assert page.locator('a[href^="tel:"]').count() == 1
    assert page.locator('a[href^="mailto:"]').count() == 1
    assert page.get_by_role('link',name='카카오톡 상담 (새 창)').count() == 1
    checks.append({'case':'contact-links-without-dummy-form','passed':True})
    page.goto(BASE+'/',wait_until='networkidle')
    page.locator('header a[href="/forms"]:visible').first.click()
    expect(page).to_have_url(BASE+'/forms')
    expect(page.locator('[data-forms-library]')).to_be_visible()
    checks.append({'case':'existing-header-click-to-library','passed':True})
    checks.append({'case':'home-consultation-sample-header-isolation','passed':True})
    assert not errors,errors
    context.close()
    nojs = browser.new_context(java_script_enabled=False)
    page = nojs.new_page()
    page.goto(BASE+'/forms')
    assert page.locator('[data-form-id]').count() == 74
    assert page.locator('[data-form-download]').count() == 73
    assert page.locator('[data-form-id="NTS-CE-01"] [data-form-download]').count() == 0
    assert page.locator('[data-registration-guide]').count() == 4
    checks.append({'case':'server-rendered-downloads-without-js','passed':True})
    nojs.close()
    browser.close()

result = {'base_url':BASE,'source_sha':os.environ.get('GITHUB_SHA'),'checks':checks,
          'real_model_calls':0,'mcp_calls':0,'physical_device_test':False,
          'test_type':'actual local production build' if '127.0.0.1' in BASE else 'deployed URL'}
(OUT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
