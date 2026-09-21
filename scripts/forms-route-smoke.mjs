import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

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
const lookupContexts = [['before-death', LOOKUP_SERVICES], ['after-death', POST_DEATH_LOOKUP_SERVICES]];
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
const request = async path => {
  const result = await fetch(host + path);
  return { status: result.status, text: await result.text() };
};
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await request('/forms')).status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs);
  const main = await request('/forms');
  assert.match(main.text, /data-forms-library="stages-v2"/);
  assert.match(main.text, /103/);
  assert.match(main.text, /177/);
  assert.match(main.text, /카카오 상담 \(새 창\)/);
  assert.match(main.text, /서류양식/);
  assert.equal((main.text.match(/data-form-id="/g) || []).length, 18);
  const index = await request('/forms/planning');
  assert.equal(index.status, 200);
  const content = JSON.parse(readFileSync('lib/forms/planning-content.json', 'utf8'));
  for (const resource of content.resources) {
    const page = await request('/forms/planning/' + resource.id);
    const html = renderedHtml(page.text);
    assert.equal(page.status, 200, resource.id);
    assert.ok(page.text.includes(resource.title), resource.id);
    assert.match(page.text, /요약/);
    assert.match(page.text, /자동 전송되지 않습니다/);
    if (resource.id === 'PLAN-01') {
      for (const id of ['family_context', 'asset_notes', 'debt_notes']) {
        assert.ok(page.text.includes(`id="${id}"`), `PLAN-01/${id}: input anchor exists`);
        assert.ok(page.text.includes(`data-lookup-field="${id}"`), `PLAN-01/${id}: lookup instructions available`);
      }
      assert.ok(page.text.includes('/forms/guides/after-death#estate-inquiry'), 'post-death applicants use their own inquiry route');
    }
    if (resource.id === 'PLAN-04') assert.ok(page.text.includes('data-lookup-field="income_notes"'), 'pension lookup connects to living-income notes');
    for (const [timing, services] of lookupContexts) for (const service of services) {
      for (const target of service.targets.filter(item => item.resourceId === resource.id)) {
        const help = elementWithAttributes(html, { 'data-lookup-field': target.questionId, 'data-lookup-timing': timing });
        assert.match(help, /^<details\b/, `${resource.id}/${target.questionId}: separate ${timing} instructions`);
        assert.ok(elementWithAttributes(html, { id: target.questionId }), `${resource.id}/${target.questionId}: actual field anchor`);
        const copy = textContent(help);
        assert.ok(copy.includes(target.record) && copy.includes(target.example), `${service.id}: context-specific recording instructions`);
        assert.ok(copy.includes(service.authentication.text), `${service.id}: authentication guidance at the field`);
        assert.ok(help.includes(`href="/forms/guides/${timing}#lookup-${service.id}"`), `${service.id}: back link to the matching guide service`);
      }
    }
  }
  assert.equal((await request('/forms/planning/PLAN-99')).status, 404);
  for (const route of ['/forms/guides', '/forms/guides/before-death', '/forms/guides/after-death']) {
    const page = await request(route);
    const html = renderedHtml(page.text);
    assert.equal(page.status, 200, route);
    assert.match(page.text, /가이드/);
    if (route.endsWith('/before-death')) {
      for (const id of ['accounts', 'insurance', 'debts', 'pension', 'registry', 'property-prices', 'family', 'dormant-deposits', 'unclaimed-shares']) {
        assert.ok(html.includes(`id="lookup-${id}"`), `${id}: visible navigation anchor`);
      }
      assert.ok(html.includes('/forms/planning/PLAN-01#asset_notes'), 'asset lookup links directly to record field');
      assert.ok(html.includes('/forms/planning/PLAN-04#income_notes'), 'pension lookup links directly to income notes');
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
        for (const target of service.targets) {
          assert.ok(card.includes(`href="/forms/planning/${target.resourceId}#${target.questionId}"`), `${service.id}: direct note-field link`);
          assert.ok(copy.includes(target.label), `${service.id}: exact worksheet question label`);
        }
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
  console.log('Forms route smoke: catalog, six worksheets, three guides, nine lifetime and nine post-death services, applicant guidance, separate worksheet contexts, invalid routes, precheck and original PDF passed.');
} catch (error) {
  console.error(logs);
  throw error;
} finally { server.kill('SIGTERM'); }
