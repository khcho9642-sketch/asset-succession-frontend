"""Verify the integrated catalog on the actual Preview; no AI/MCP calls."""
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import unquote

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ['FORM_LIBRARY_BASE_URL'].rstrip('/')
OUT = ROOT / '.tmp' / 'forms-additions-preview-proof'
OUT.mkdir(parents=True, exist_ok=True)
manifest = json.loads((ROOT / 'public/downloads/official-forms/manifest.json').read_text(encoding='utf-8'))
checks = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    remote = context.request.get(BASE + '/downloads/official-forms/manifest.json')
    assert remote.status == 200
    assert remote.json() == manifest, 'Preview does not match local deployment manifest'
    file_count = 0
    for item in manifest['documents']:
        for file in item['files']:
            if file['delivery'] != 'hosted':
                continue
            response = context.request.get(BASE + file['path'])
            assert response.status == 200, (item['id'], response.status)
            expected = (ROOT / 'public' / unquote(file['path']).lstrip('/')).read_bytes()
            assert len(response.body()) == file['bytes']
            assert hashlib.sha256(response.body()).digest() == hashlib.sha256(expected).digest(), file['path']
            file_count += 1
    checks.append({'case': 'hosted-downloads-byte-identical', 'files': file_count})
    print(f'PASS {file_count} hosted download responses', flush=True)
    bundle_path = manifest['bundle']['path']
    bundle = context.request.get(BASE + bundle_path)
    assert bundle.status == 200
    assert hashlib.sha256(bundle.body()).digest() == hashlib.sha256((ROOT / 'public' / bundle_path.lstrip('/')).read_bytes()).digest()
    checks.append({'case': 'original-74-bundle-byte-identical', 'bytes': len(bundle.body())})
    old = context.request.get(BASE + '/downloads/asset-succession-forms-v1/index.html', max_redirects=0)
    assert old.status in (307, 308)
    assert old.headers['location'] in ('/forms', BASE + '/forms')
    retired = json.loads((ROOT / 'docs/reviews/retired-form-paths.json').read_text(encoding='utf-8'))
    from urllib.parse import quote
    for path in retired:
        if path.endswith('/index.html'):
            continue
        response = context.request.get(BASE + quote(path, safe='/'), max_redirects=0)
        assert response.status in (404, 410), (path, response.status)
    checks.append({'case': 'legacy-redirect-and-retired-downloads', 'retired': len(retired) - 1})

    for width, height in [(1440, 1000), (360, 812), (390, 844)]:
        page.set_viewport_size({'width': width, 'height': height})
        response = page.goto(BASE + '/forms', wait_until='networkidle')
        assert response.status == 200
        expect(page.locator('[data-form-id]')).to_have_count(177)
        expect(page.locator('[data-catalog-summary]')).to_contain_text('전체 177개 자료')
        guides = page.locator('[data-official-registration-guides]')
        expect(guides.locator('[data-registration-guide]')).to_have_count(4)
        expect(guides.locator('a')).to_have_count(8)
        expect(page.locator('[data-form-preview] img')).to_have_count(74)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), width
        assert not page.locator('[data-form-id] h3').evaluate_all('(items) => items.filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent)'), width
        page.screenshot(path=str(OUT / f'forms-top-{width}.png'))
        page.locator('[data-result-count]').scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / f'forms-catalog-{width}.png'))
        search = page.get_by_role('searchbox', name='서류명·용도로 찾기')
        search.fill('특별한정승인')
        expect(page.locator('[data-form-id]')).to_have_count(1)
        card = page.locator('[data-form-id="P0-10"]')
        expect(card).to_contain_text('공식 제공처')
        card.locator('[data-form-preview]').click()
        expect(page.get_by_role('dialog')).to_be_visible()
        expect(page.get_by_role('dialog')).to_contain_text('특별한정승인')
        page.screenshot(path=str(OUT / f'new-source-detail-{width}.png'))
        page.keyboard.press('Escape')
        search.fill('')
        status = page.get_by_role('combobox', name='자료 제공 상태')
        for value, count in [('hosted', 105), ('provider', 61), ('pending', 11), ('all', 177)]:
            status.select_option(value)
            expect(page.locator('[data-form-id]')).to_have_count(count)
        for ident in ['P0-10', 'P1-02', 'REG-I-01', 'REG-I-03', 'REG-G-01']:
            item = next(item for item in manifest['documents'] if item['id'] == ident)
            card = page.locator(f'[data-form-id="{ident}"]')
            assert card.locator('[data-form-download]').get_attribute('href') == item['editable']
            assert card.locator('a').last.get_attribute('href') == item['sourceUrl']
        card = page.locator('[data-form-id="BP-I-01"]')
        card.locator('[data-form-preview]').click()
        expect(page.locator('[data-preview-resolution-note]')).to_be_visible()
        expect(page.get_by_role('dialog').locator('img')).to_be_visible()
        assert page.get_by_role('dialog').locator('img').evaluate('(img) => img.complete && img.naturalWidth > 0')
        page.keyboard.press('Escape')
        checks.append({'case': 'responsive-search-status-details', 'width': width, 'cards': 177, 'passed': True})
        print(f'PASS browser flow {width}px', flush=True)

    page.set_viewport_size({'width': 1440, 'height': 1000})
    response = page.goto(BASE, wait_until='networkidle')
    assert response.status == 200
    page.locator('header').get_by_role('link', name='서류양식', exact=True).click()
    expect(page).to_have_url(BASE + '/forms')
    page.get_by_role('searchbox', name='서류명·용도로 찾기').fill('P0-11')
    with page.expect_download() as result:
        page.locator('[data-form-id="P0-11"] [data-form-download]').click()
    download = result.value
    download.save_as(str(OUT / download.suggested_filename))
    assert '취득세' in download.suggested_filename
    checks.append({'case': 'main-nav-and-Korean-download-click', 'filename': download.suggested_filename})
    assert not errors, errors
    browser.close()

(OUT / 'results.json').write_text(json.dumps({'base': BASE, 'checks': checks, 'pageErrors': errors}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'passed': len(checks), 'pageErrors': errors, 'proof': str(OUT)}, ensure_ascii=False), flush=True)
