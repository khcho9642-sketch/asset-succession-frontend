"""Read official provider pages without downloading or republishing their documents."""
import json
import hashlib
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.tmp/forms-catalog-sources'
OUT.mkdir(parents=True, exist_ok=True)
catalog = json.loads((ROOT / 'docs/reviews/official_forms_catalog_candidates.json').read_text(encoding='utf-8-sig'))
def title_key(record):
    overrides = {'BP-I-01': '상속재산분할협의서', 'BP-G-01': '증여계약서',
                 'DD-G-01': '증여계약서(샘플).hwp', 'FAMILY-I-01': '상속재산명세표 양식 게시',
                 'NTS-CE-01': '비상장 대기업 주식을 양도한 경우로서 실지거래가액이 있는 경우'}
    if record['id'] in overrides:
        return overrides[record['id']]
    title = record['title']
    if record['id'].startswith('SC-'):
        return title.split(' — ')[1]
    return title.split(' — ')[0].split(' 등')[0]


def normalize(text):
    return re.sub(r'[^a-z0-9가-힣]', '', text.lower())


def summarize(results):
    records = []
    for record in catalog['records']:
        source = next(item for item in results if item['id'] == record['source_id'])
        cached = OUT / (source['id'] + '.txt')
        body = cached.read_text(encoding='utf-8') if cached.exists() else ''
        key = title_key(record)
        matched = source.get('status') == 200 and not source.get('blocked') and normalize(key) in normalize(body)
        records.append({'id': record['id'], 'sourceId': source['id'], 'url': record['source_url'],
                        'titleKey': key, 'titleFoundInOfficialPage': bool(matched),
                        'pageTextSha256': hashlib.sha256(body.encode()).hexdigest(),
                        'binaryVerifiedByThisAudit': False})
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'recordCount': len(records),
              'matchedCount': sum(item['titleFoundInOfficialPage'] for item in records),
              'scope': 'Official page title/list evidence only; not original file validation or redistribution clearance.',
              'sources': [{key: value for key, value in item.items() if key != 'tail'} for item in results],
              'records': records}
    (OUT / 'catalog-evidence.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'matched': report['matchedCount'], 'total': len(records),
                      'unmatched': [item['id'] for item in records if not item['titleFoundInOfficialPage']]}, ensure_ascii=False))


if '--cached' in sys.argv:
    summarize(json.loads((OUT / 'verification.json').read_text(encoding='utf-8')))
    sys.exit(0)

results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context()
    for source in catalog['sources']:
        page = context.new_page()
        result = {'id': source['id'], 'requestedUrl': source['url']}
        try:
            response = page.goto(source['url'], wait_until='domcontentloaded', timeout=30000)
            page.locator('body').wait_for()
            body = page.locator('body').inner_text()
            (OUT / (source['id'] + '.txt')).write_text(body, encoding='utf-8')
            result.update(status=response.status if response else None, url=page.url,
                          title=page.title(), textLength=len(body),
                          blocked='firewall security policies' in body.lower())
            if source['id'] in ('DD-G', 'FAMILY-I', 'NTS-IE'):
                page.screenshot(path=str(OUT / (source['id'] + '.png')))
                result['tail'] = body[-8000:]
        except Exception as error:
            result['error'] = str(error)[:500]
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
        page.close()
    browser.close()
(OUT / 'verification.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
summarize(results)
