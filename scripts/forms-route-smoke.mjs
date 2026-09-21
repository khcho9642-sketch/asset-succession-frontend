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
  }
  assert.equal((await request('/forms/planning/PLAN-99')).status, 404);
  assert.equal((await request('/precheck?purpose=inheritance')).status, 200);
  const original = await fetch(host + '/downloads/official-forms/expansion/P2-15_3aa191059786.pdf');
  assert.equal(original.status, 200);
  assert.equal(Buffer.from(await original.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  console.log('Forms route smoke: 10 pages and original PDF passed. Client browser interaction is a separate review.');
} catch (error) {
  console.error(logs);
  throw error;
} finally { server.kill('SIGTERM'); }
