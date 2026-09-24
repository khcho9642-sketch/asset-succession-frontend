import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { bankCatalog as current } from './load-current-forms.mjs';

const compiled = path.resolve('.tmp/forms-route-smoke');
mkdirSync(compiled, { recursive: true });
writeFileSync(path.join(compiled, 'package.json'), '{"type":"commonjs"}');
for (const name of ['lookup-services', 'post-death-lookup-services']) {
  writeFileSync(path.join(compiled, name + '.js'), ts.transpileModule(readFileSync(`lib/forms/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
const require = createRequire(import.meta.url);
const { LOOKUP_SERVICES } = require(path.join(compiled, 'lookup-services.js'));
const { POST_DEATH_LOOKUP_SERVICES } = require(path.join(compiled, 'post-death-lookup-services.js'));
// Ignore the embedded React payload: these assertions must find rendered elements and links.
const renderedHtml = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const decode = text => text.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" }[entity]));
const textContent = html => decode(html.replace(/<[^>]*>/g, ''));
function elementWithAttributes(html, attributes) {
  for (const opening of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    if (!Object.entries(attributes).every(([name, value]) => opening[0].includes(`${name}="${value}"`))) continue;
    const tags = new RegExp(`<\\/?${opening[1]}\\b[^>]*>`, 'gi');
    tags.lastIndex = opening.index + opening[0].length;
    let depth = 1;
    for (let tag; (tag = tags.exec(html));) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (!depth) return html.slice(opening.index, tags.lastIndex);
    }
  }
  return '';
}

const host = 'http://127.0.0.1:4189';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '4189'], { stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
const request = async (path, options) => {
  const result = await fetch(host + path, options);
  return { status: result.status, location: result.headers.get("location"), text: await result.text() };
};
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await request('/forms')).status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs);
  const main = await request('/forms');
  assert.match(main.text, /data-forms-library="individual-v3"/);
  assert.ok(textContent(renderedHtml(main.text)).includes(`개별 자료 ${current.cards.length}개`));
  assert.doesNotMatch(renderedHtml(main.text), /href="[^"\s]*\/forms\/planning/);
  assert.match(main.text, /카카오 상담 \(새 창\)/);
  assert.match(main.text, /서류양식/);
  assert.equal((main.text.match(/data-form-id="/g) || []).length, 18);
  for (const route of ['/forms/planning', ...Array.from({ length: 6 }, (_, index) => `/forms/planning/PLAN-0${index + 1}`)]) {
    const page = await request(route, { redirect: 'manual' });
    assert.equal(page.status, 307, route);
    assert.equal(page.location, '/forms', route);
  }
  assert.equal((await request('/forms/planning/PLAN-99')).status, 404);
  for (const route of ['/forms/guides', '/forms/guides/before-death', '/forms/guides/after-death', '/forms/guides/gift', '/forms/guides/transfer', '/forms/guides/business-succession']) {
    const page = await request(route);
    const html = renderedHtml(page.text);
    assert.equal(page.status, 200, route);
    assert.match(page.text, /가이드/);
    assert.doesNotMatch(html, /href="[^"\s]*\/forms\/planning/);
    if (route.endsWith('/before-death')) {
      for (const id of ['accounts', 'insurance', 'debts', 'pension', 'registry', 'property-prices', 'family', 'dormant-deposits', 'unclaimed-shares']) {
        assert.ok(html.includes(`id="lookup-${id}"`), `${id}: visible navigation anchor`);
      }
      assert.match(html, /href="https:[^"]+" target="_blank" rel="noopener noreferrer"/);
      for (const service of POST_DEATH_LOOKUP_SERVICES) assert.ok(!html.includes(`id="lookup-${service.id}"`), `${service.id}: not mixed into the lifetime guide`);
    }
    if (route.endsWith('/after-death')) {
      for (const service of POST_DEATH_LOOKUP_SERVICES) {
        const step = elementWithAttributes(html, { id: service.stepId });
        const panel = elementWithAttributes(step, { 'data-lookup-timing': 'after-death' });
        const card = elementWithAttributes(panel, { id: `lookup-${service.id}` });
        assert.ok(card, `${service.id}: service appears in ${service.stepId}`);
        assert.equal(html.split(`id="lookup-${service.id}"`).length - 1, 1, `${service.id}: unique service anchor`);
        assert.match(card, /<details\b/, `${service.id}: expandable instructions`);
        const copy = textContent(card);
        for (const label of ['신청 자격', '본인 인증', '준비 서류', '대리 신청', '신청 방식']) {
          assert.ok(copy.includes(label), `${service.id}: visible ${label} heading`);
        }
        for (const value of [service.application.eligibility, service.authentication.text, ...service.application.documents, service.application.representative, service.application.channel]) {
          assert.ok(copy.includes(value), `${service.id}: actual applicant guidance rendered`);
        }
        const link = [...card.matchAll(/<a\b[^>]*>/g)].find(match => decode(match[0]).includes(`href="${service.url}"`))?.[0] ?? '';
        assert.ok(link.includes('target="_blank"') && link.includes('rel="noopener noreferrer"'), `${service.id}: official site opens safely in a new tab`);
      }
      for (const service of LOOKUP_SERVICES) assert.ok(!html.includes(`id="lookup-${service.id}"`), `${service.id}: lifetime card stays out of post-death guide`);
      assert.doesNotMatch(html, /href="https:\/\/[^"\s]*(?:payinfo|credit4u)\.or\.kr/, 'post-death guide does not send applicants to deceased-owner account or credit logins');
    }
  }
  assert.equal((await request('/forms/guides/unknown')).status, 404);
  assert.equal((await request('/precheck?purpose=inheritance')).status, 200);
  const original = await fetch(host + '/downloads/official-forms/expansion/P2-15_3aa191059786.pdf');
  assert.equal(original.status, 200);
  assert.equal(Buffer.from(await original.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  console.log('Forms route smoke: public individual catalog, seven retired worksheet redirects, guide index + five guides, eighteen lookup services, applicant guidance, invalid routes, precheck and original PDF passed.');
} catch (error) {
  console.error(logs);
  throw error;
} finally { server.kill('SIGTERM'); }
