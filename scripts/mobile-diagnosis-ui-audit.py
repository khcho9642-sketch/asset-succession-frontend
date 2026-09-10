"""Mobile diagnosis layout regression. Uses synthetic inputs, no model calls.

MOBILE_CHAT_BASE_URL selects local or approved preview. Virtual keyboard tests
simulate visual-viewport-only shrink/pan and full viewport shrink; they are not
physical Android/iOS device tests. Screenshots contain only synthetic examples.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('MOBILE_CHAT_BASE_URL', 'http://127.0.0.1:3000').rstrip('/')
OUT = Path(os.environ.get('MOBILE_CHAT_PROOF_DIR', '.tmp/mobile-chat-proof'))
OUT.mkdir(parents=True, exist_ok=True)
checks = []
requests = []


def fake_api(route):
    if route.request.method == 'GET':
        route.fulfill(status=200, content_type='application/json', body='{"configured":true,"issues":[]}')
    else:
        requests.append({'method': route.request.method, 'mocked': True})
        route.fulfill(status=503, content_type='application/json', body='{"error":"synthetic-offline"}')


def visible_inside(page, locator, label):
    expect(locator).to_be_visible()
    box = locator.bounding_box()
    view = page.evaluate('({width:innerWidth, top:visualViewport?.offsetTop||0, height:visualViewport?.height||innerHeight})')
    assert box['x'] >= -1 and box['x'] + box['width'] <= view['width'] + 1, (label, box, view)
    assert box['y'] >= view['top'] - 1 and box['y'] + box['height'] <= view['top'] + view['height'] + 2, (label, box, view)
    return box


def composer_inside(page):
    text = visible_inside(page, page.locator('#diagnosis-message'), 'textarea')
    button = visible_inside(page, page.get_by_role('button', name='메시지 보내기', exact=True), 'send')
    assert button['width'] >= 44 and button['height'] >= 44
    assert text['x'] + text['width'] <= button['x'] + 1
    assert float(page.locator('#diagnosis-message').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')) >= 16
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal page overflow'
    return {'textarea': text, 'send': button}


with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(320,568), (360,640), (360,672), (375,667), (390,844), (412,915)]:
        context = browser.new_context(viewport={'width':width, 'height':height}, device_scale_factor=1, is_mobile=True, has_touch=True)
        context.route('**/api/diagnosis', fake_api)
        page = context.new_page()
        page.goto(BASE + '/precheck', wait_until='networkidle')
        workspace = page.locator('[data-chat-layout="mobile-fit-v1"]')
        expect(workspace).to_have_attribute('data-chat-stage', 'chat')
        page.wait_for_timeout(180)
        expect(page.get_by_role('button', name='상속', exact=True)).to_be_enabled()
        for name in ['상속','증여','양도','가업상속']:
            box = visible_inside(page, page.get_by_role('button', name=name, exact=True), name)
            assert box['height'] >= 48
        bounds = composer_inside(page)
        page.screenshot(path=str(OUT / f'opening-{width}-{height}.png'))
        checks.append({'case':'opening', 'width':width, 'height':height, 'composer':bounds, 'all_topics_visible':True})
        if width == 360 and height == 672:
            page.get_by_role('button', name='상속', exact=True).click()
            expect(page.get_by_role('button', name='미리 준비 중이에요', exact=True)).to_be_visible()
            composer_inside(page)
            page.get_by_role('button', name='미리 준비 중이에요', exact=True).click()
            expect(page.get_by_role('button', name='아버지', exact=True)).to_be_visible()
            composer_inside(page)
            page.screenshot(path=str(OUT / 'conversation-360.png'))
            summary = page.get_by_role('button', name='현재 정리된 내용', exact=False)
            summary.click()
            expect(workspace).to_have_attribute('data-summary-open', 'true')
            visible_inside(page, summary, 'summary-close-toggle')
            page.screenshot(path=str(OUT / 'summary-360.png'))
            summary.click()
            expect(workspace).to_have_attribute('data-summary-open', 'false')
            composer_inside(page)
            textarea = page.locator('#diagnosis-message')
            textarea.fill('아직 보내지 않은 가상 테스트 초안')
            expect(page.get_by_role('button', name='메시지 보내기', exact=True)).to_be_enabled()
            # Chrome Android default: visual viewport shrinks, layout stays tall.
            page.evaluate('''() => {
              window.__keyboardHeight = 360; window.__keyboardTop = 0;
              Object.defineProperty(visualViewport, 'height', {configurable:true, get:()=>window.__keyboardHeight});
              Object.defineProperty(visualViewport, 'offsetTop', {configurable:true, get:()=>window.__keyboardTop});
              visualViewport.dispatchEvent(new Event('resize'));
            }''')
            expect(workspace).to_have_attribute('data-keyboard-open', 'true')
            page.wait_for_timeout(100)
            composer_inside(page)
            page.screenshot(path=str(OUT / 'keyboard-visual-360.png'))
            page.evaluate('window.__keyboardTop = 36; visualViewport.dispatchEvent(new Event("scroll"));')
            page.wait_for_timeout(100)
            composer_inside(page)
            page.evaluate('delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event("resize"));')
            page.wait_for_timeout(100)
            # Browsers configured to resize both viewports.
            page.set_viewport_size({'width':360,'height':360})
            expect(workspace).to_have_attribute('data-keyboard-open', 'true')
            page.wait_for_timeout(100)
            composer_inside(page)
            page.screenshot(path=str(OUT / 'keyboard-resized-360.png'))
            textarea.fill(('가상 테스트 긴 문장입니다.\n') * 25)
            page.wait_for_timeout(100)
            composer_inside(page)
            assert textarea.bounding_box()['height'] <= 97
            page.set_viewport_size({'width':360,'height':672})
            textarea.fill('보존할 가상 초안')
            textarea.blur()
            expect(workspace).to_have_attribute('data-keyboard-open', 'false')
            page.wait_for_timeout(100)
            composer_inside(page)
            page.reload(wait_until='networkidle')
            expect(page.locator('#diagnosis-message')).to_have_value('보존할 가상 초안')
            composer_inside(page)
            checks.append({'case':'guided-conversation-summary-keyboard', 'visual_shrink':True, 'visual_pan':True, 'layout_shrink':True, 'long_draft_capped':True, 'draft_survives_reload':True, 'physical_device_test':False})
        context.close()
    context = browser.new_context(viewport={'width':1440,'height':1000}, device_scale_factor=1)
    context.route('**/api/diagnosis', fake_api)
    page = context.new_page()
    page.goto(BASE + '/precheck', wait_until='networkidle')
    page.wait_for_timeout(150)
    expect(page.locator('header').first).to_be_visible()
    assert page.locator('[data-chat-layout]').evaluate('(e)=>e.style.getPropertyValue("--chat-available-height")') == ''
    page.screenshot(path=str(OUT / 'desktop-1440.png'))
    checks.append({'case':'desktop', 'mobile_height_not_applied':True})
    context.close()
    browser.close()

assert not requests, 'Guided layout tests must not require even mocked model POSTs'
proof = {'base_url': BASE, 'checks': checks, 'real_model_requests': 0, 'physical_keyboard_test':False, 'commit':os.environ.get('GITHUB_SHA')}
(OUT / 'verification.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(proof, ensure_ascii=False, indent=2))
