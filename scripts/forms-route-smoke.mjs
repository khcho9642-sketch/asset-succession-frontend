import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  }
  assert.equal((await request('/forms/planning/PLAN-99')).status, 404);
  for (const route of ['/forms/guides', '/forms/guides/before-death', '/forms/guides/after-death']) {
    const page = await request(route);
    assert.equal(page.status, 200, route);
    assert.match(page.text, /가이드/);
    if (route.endsWith('/before-death')) {
      for (const id of ['accounts', 'insurance', 'debts', 'pension', 'registry', 'property-prices', 'family', 'dormant-deposits', 'unclaimed-shares']) {
        assert.ok(page.text.includes(`id="lookup-${id}"`), `${id}: visible navigation anchor`);
      }
      assert.ok(page.text.includes('/forms/planning/PLAN-01#asset_notes'), 'asset lookup links directly to record field');
      assert.ok(page.text.includes('/forms/planning/PLAN-04#income_notes'), 'pension lookup links directly to income notes');
      assert.match(page.text, /href="https:[^"]+" target="_blank" rel="noopener noreferrer"/);
    }
    if (route.endsWith('/after-death')) assert.ok(!page.text.includes('id="lookup-accounts"'), 'self-authenticated lifetime account lookup stays out of post-death instructions');
  }
  assert.equal((await request('/forms/guides/unknown')).status, 404);
  assert.equal((await request('/precheck?purpose=inheritance')).status, 200);
  const original = await fetch(host + '/downloads/official-forms/expansion/P2-15_3aa191059786.pdf');
  assert.equal(original.status, 200);
  assert.equal(Buffer.from(await original.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  console.log('Forms route smoke: catalog, six worksheets, three guides, nine lifetime lookup anchors and note fields, invalid routes, precheck and original PDF passed.');
} catch (error) {
  console.error(logs);
  throw error;
} finally { server.kill('SIGTERM'); }
