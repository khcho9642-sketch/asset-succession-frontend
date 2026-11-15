import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Compile the actual two production modules in memory. No HTTP, mail, database,
// build output, or temporary module files are created by this test runner.
function compile(file, imports = {}) {
  const output = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, strict: true },
    reportDiagnostics: true,
  });
  assert.equal(output.diagnostics?.length ?? 0, 0, file);
  const module = { exports: {} };
  const restrictedRequire = name => {
    assert.ok(Object.hasOwn(imports, name), 'Unexpected test import: ' + name);
    return imports[name];
  };
  new Function('require', 'module', 'exports', output.outputText)(restrictedRequire, module, module.exports);
  return module.exports;
}

const lib = compile('lib/consultation.ts');
const route = compile('app/api/consultation/route.ts', { '../../../lib/consultation': lib });
const ID = 'a1234567-1234-4123-8123-123456789abc';
const valid = { phone: '000-0000-0000', consent: true, requestId: ID };
const origin = 'https://asset360.intellic.co.kr';
const webhook = 'https://script.google.com/macros/s/TEST_ONLY_NEVER_REQUESTED/exec';
const token = 'fake-token-not-a-real-credential';
const originalFetch = globalThis.fetch;
const oldEnv = Object.fromEntries(['CONSULTATION_WEBHOOK_URL', 'CONSULTATION_WEBHOOK_TOKEN'].map(key => [key, process.env[key]]));
globalThis.fetch = async () => { throw new Error('No real network access permitted in consultation tests'); };
process.env.CONSULTATION_WEBHOOK_URL = webhook;
process.env.CONSULTATION_WEBHOOK_TOKEN = token;

function request(body = valid, headers = {}, url = origin + '/api/consultation') {
  return new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

function json(value, status = 200) { return Response.json(value, { status }); }

async function fakeFetch(handler, run) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return handler(calls.at(-1), calls.length);
  };
  try { await run(calls); }
  finally { globalThis.fetch = previous; }
}

async function result(req = request()) {
  const response = await route.POST(req);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  return { status: response.status, body: await response.json() };
}

async function fails(req, status, code) {
  const actual = await result(req);
  assert.equal(actual.status, status);
  assert.equal(actual.body.ok, false);
  assert.equal(actual.body.error.code, code);
  assert.equal(typeof actual.body.error.message, 'string');
  assert.equal(typeof actual.body.retryable, 'boolean');
  assert.equal(actual.body.receiptId, undefined);
  return actual;
}

try {
  await test('route confirms stored and mailed receipt, sends only the reviewed server payload', async () => {
    assert.equal(route.runtime, 'nodejs');
    assert.equal(route.dynamic, 'force-dynamic');
    assert.equal(route.maxDuration, 60);
    assert.ok(lib.CONSULTATION_LIMITS.bodyTimeoutMs + 2 * lib.CONSULTATION_LIMITS.deliveryTimeoutMs < route.maxDuration * 1000);
    await fakeFetch(() => json({ ok: true, sheet: true, mail: true }), async calls => {
      assert.deepEqual(await result(request({ ...valid, assessmentId: 'AS360-TEST-1', website: '' })), {
        status: 200, body: { ok: true, receiptId: ID, notification: 'sent' },
      });
      assert.equal(calls.length, 1);
      const { url, options, body } = calls[0];
      assert.equal(url, webhook);
      assert.equal(options.method, 'POST');
      assert.equal(options.cache, 'no-store');
      assert.ok(options.signal instanceof AbortSignal);
      assert.deepEqual(Object.keys(body).sort(), ['assessmentId', 'consent', 'phone', 'requestId', 'service', 'source', 'submittedAt', 'token']);
      assert.equal(body.phone, '00000000000');
      assert.equal(body.assessmentId, 'AS360-TEST-1');
      assert.equal(body.requestId, ID);
      assert.equal(body.token, token);
      assert.ok(Number.isFinite(Date.parse(body.submittedAt)));
    });
  });

  await test('delivery allowlist cannot forward extra diagnosis fields even from a future internal caller', async () => {
    await fakeFetch(() => json({ sheet: true, mail: true }), async calls => {
      await lib.deliverConsultationLead({ ...lib.validateConsultationLead(valid), diagnosis: 'must-not-leave', token: 'client-token', website: 'bot' }, lib.getConsultationConfiguration());
      assert.equal(calls[0].body.diagnosis, undefined);
      assert.equal(calls[0].body.website, undefined);
      assert.equal(calls[0].body.token, token);
    });
  });

  await test('server rejects invalid contact, consent, IDs, honeypot and unapproved diagnosis data before delivery', async () => {
    const bad = [null, [], {}, { ...valid, phone: '' }, { ...valid, phone: 'abc' }, { ...valid, phone: '-01012345678' },
      { ...valid, phone: '123' }, { ...valid, phone: '1234567890123456' }, { ...valid, phone: '0'.repeat(26) },
      { ...valid, consent: false }, { ...valid, consent: 'true' }, { ...valid, requestId: undefined },
      { ...valid, requestId: 'AS360-not-a-UUID' }, { ...valid, assessmentId: 1 }, { ...valid, assessmentId: 'wrong' },
      { ...valid, assessmentId: 'AS360-' + 'a'.repeat(200) }, { ...valid, website: 'spam.example' }, { ...valid, website: {} },
      { ...valid, website: ' '.repeat(201) }, { ...valid, diagnosis: { family: 'not allowed' } }, { ...valid, token: 'client-token' }];
    await fakeFetch(() => assert.fail('Invalid input reached provider'), async calls => {
      for (const body of bad) await fails(request(body), 400, 'INVALID_REQUEST');
      assert.equal(calls.length, 0);
    });
    assert.deepEqual(lib.validateConsultationLead({ ...valid, phone: ' +82 (10) 1234-5678 ', assessmentId: '' }), { ...valid, phone: '+821012345678' });
  });

  await test('same-origin requirement ignores forged forwarded hosts and accepts Next canonicalized hosts', async () => {
    await fakeFetch(() => json({ sheet: true, mail: true }), async calls => {
      for (const headers of [{ origin: '' }, { origin: 'https://evil.invalid' }, { 'sec-fetch-site': 'cross-site' },
        { host: 'bad host' }, { origin: 'https://evil.invalid', 'x-forwarded-host': 'evil.invalid' }]) {
        await fails(request(valid, headers), 403, 'ORIGIN_NOT_ALLOWED');
      }
      assert.equal(calls.length, 0);
      const response = await result(request(valid, { host: 'asset360.intellic.co.kr' }, 'https://localhost/api/consultation'));
      assert.equal(response.body.ok, true);
      assert.equal(calls.length, 1);
    });
  });

  await test('missing or unsafe webhook configuration fails closed without external calls', async () => {
    await fakeFetch(() => assert.fail('Unsafe configuration reached provider'), async calls => {
      for (const url of ['', 'not-a-url', 'http://script.google.com/macros/s/id/exec', 'https://evil.invalid/macros/s/id/exec',
        'https://script.google.com.evil.invalid/macros/s/id/exec', 'https://user:pass@script.google.com/macros/s/id/exec',
        webhook + '?token=bad', webhook + '#fragment', 'https://script.google.com:444/macros/s/id/exec',
        'https://script.google.com/macros/s/id/dev']) {
        process.env.CONSULTATION_WEBHOOK_URL = url;
        assert.equal(lib.getConsultationConfiguration(), null);
        await fails(request(), 503, 'NOT_CONFIGURED');
      }
      process.env.CONSULTATION_WEBHOOK_URL = webhook;
      delete process.env.CONSULTATION_WEBHOOK_TOKEN;
      await fails(request(), 503, 'NOT_CONFIGURED');
      process.env.CONSULTATION_WEBHOOK_TOKEN = token;
      assert.equal(calls.length, 0);
    });
  });

  await test('JSON content type, declared and streamed body limits, malformed JSON and UTF-8 are enforced', async () => {
    await fakeFetch(() => assert.fail('Invalid request body reached provider'), async () => {
      for (const contentType of ['text/plain', 'application/jsonp', 'application/json-invalid']) {
        await fails(request(valid, { 'content-type': contentType }), 415, 'JSON_REQUIRED');
      }
      await fails(request(valid, { 'content-length': '4097' }), 413, 'REQUEST_TOO_LARGE');
      await fails(request({ ...valid, website: '한'.repeat(2000) }), 413, 'REQUEST_TOO_LARGE');
      for (const body of ['{', new Uint8Array([0xff]), undefined]) {
        await fails(new Request(origin + '/api/consultation', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body }), 400, 'INVALID_REQUEST');
      }
    });
    assert.deepEqual(await lib.readConsultationBody(request(valid, { 'content-type': 'Application/JSON; charset=utf-8' })), valid);
  });

  await test('slow request stream is cancelled within the small body timeout', async () => {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    const req = new Request(origin + '/api/consultation', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body, duplex: 'half' });
    const started = Date.now();
    await fakeFetch(() => assert.fail('Incomplete request reached provider'), async () => {
      await fails(req, 408, 'REQUEST_TIMEOUT');
    });
    assert.ok(cancelled);
    assert.ok(Date.now() - started < 7000);
  });

  await test('external HTTP 200 is not a receipt without explicit sheet success and boolean mail status', async () => {
    const responses = [{ ok: true, sheet: false, mail: false }, { ok: false, sheet: false, mail: true },
      { ok: true }, { sheet: 'true', mail: true }, { sheet: true, mail: 'true' }, { sheet: true }, null, []];
    for (const value of responses) {
      await fakeFetch(() => json(value), async calls => {
        await fails(request(), 502, 'DELIVERY_UNCONFIRMED');
        assert.equal(calls.length, 1, 'Unknown storage result must not start a second server attempt');
      });
    }
  });

  await test('provider HTTP failure, invalid JSON and network failures expose no secret or phone', async () => {
    const handlers = [() => json({ sheet: true, mail: true }, 500), () => new Response('<html>not JSON</html>'),
      () => { throw new Error(webhook + token + valid.phone); }];
    for (const handler of handlers) {
      await fakeFetch(handler, async calls => {
        const actual = await fails(request(), 502, 'DELIVERY_UNCONFIRMED');
        for (const privateValue of [webhook, token, valid.phone]) assert.ok(!JSON.stringify(actual).includes(privateValue));
        assert.equal(calls.length, 1);
      });
    }
    await fakeFetch(() => { throw new DOMException('untrusted provider text', 'TimeoutError'); }, async () => {
      assert.equal((await fails(request(), 504, 'DELIVERY_TIMEOUT')).body.retryable, true);
    });
  });

  await test('pending mail retries once with byte-identical payload and the same request ID', async () => {
    await fakeFetch((_, count) => json({ ok: count === 2, sheet: true, mail: count === 2 }), async calls => {
      assert.deepEqual(await result(), { status: 200, body: { ok: true, receiptId: ID, notification: 'sent' } });
      assert.equal(calls.length, 2);
      assert.equal(calls[0].options.body, calls[1].options.body);
      assert.equal(calls[1].body.requestId, ID);
    });
  });

  await test('confirmed storage remains a successful pending receipt when the notification retry fails', async () => {
    const secondAttempts = [() => json({ sheet: true, mail: false }), () => json({ sheet: false, mail: false }),
      () => new Response('bad JSON'), () => { throw new DOMException('timeout', 'TimeoutError'); }];
    for (const second of secondAttempts) {
      await fakeFetch((_, count) => count === 1 ? json({ ok: false, sheet: true, mail: false }) : second(), async calls => {
        assert.deepEqual(await result(), { status: 200, body: { ok: true, receiptId: ID, notification: 'pending' } });
        assert.equal(calls.length, 2);
      });
    }
  });

  await test('provider ok is not used in place of independent sheet and mail confirmations', async () => {
    await fakeFetch(() => json({ ok: false, sheet: true, mail: true }), async calls => {
      assert.equal((await result()).body.notification, 'sent');
      assert.equal(calls.length, 1);
    });
  });

  await test('client retries and concurrent duplicates preserve the stable provider deduplication key', async () => {
    const records = new Map();
    let storedRows = 0;
    let mailCount = 0;
    await fakeFetch(({ body }) => {
      const prior = records.get(body.requestId);
      if (prior) return json({ sheet: prior.phone === body.phone && prior.assessmentId === body.assessmentId, mail: true });
      records.set(body.requestId, body);
      storedRows += 1;
      mailCount += 1;
      return json({ sheet: true, mail: true });
    }, async calls => {
      const results = await Promise.all([result(), result(), result()]);
      assert.ok(results.every(value => value.body.receiptId === ID && value.body.notification === 'sent'));
      assert.equal(storedRows, 1);
      assert.equal(mailCount, 1);
      assert.equal(calls.length, 3);
      await fails(request({ ...valid, phone: '11111111111' }), 502, 'DELIVERY_UNCONFIRMED');
      assert.equal(storedRows, 1);
    });
  });

  await test('lost response after storage can be retried with the same client key', async () => {
    let stored = false;
    let sent = 0;
    await fakeFetch(({ body }) => {
      assert.equal(body.requestId, ID);
      if (!stored) { stored = true; sent += 1; throw new DOMException('lost response', 'TimeoutError'); }
      return json({ sheet: true, mail: true });
    }, async () => {
      await fails(request(), 504, 'DELIVERY_TIMEOUT');
      assert.equal((await result()).body.receiptId, ID);
      assert.equal(sent, 1);
    });
  });

  await test('client cancellation cannot erase a stored receipt or trigger a further notification attempt', async () => {
    const controller = new AbortController();
    await fakeFetch(() => { controller.abort(); return json({ sheet: true, mail: false }); }, async calls => {
      const receipt = await lib.deliverConsultationLead(lib.validateConsultationLead(valid), lib.getConsultationConfiguration(), controller.signal);
      assert.equal(receipt.notification, 'pending');
      assert.equal(calls.length, 1);
    });
  });
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
