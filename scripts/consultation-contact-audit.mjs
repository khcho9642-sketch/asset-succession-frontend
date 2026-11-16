import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const output = process.env.UI_AUDIT_DIR ?? '.tmp/consultation-contact';
const testPhone = '000-0000-0000'; // Synthetic; every POST is intercepted below.
const otherPhone = '000-0000-0001';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const endpoint = new URL('/api/consultation', baseURL);
const results = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

function requestBody(request) {
  assert.equal(request.method(), 'POST');
  assert.match(request.headers()['content-type'] ?? '', /^application\/json(?:;|$)/i);
  const body = request.postDataJSON();
  assert.deepEqual(Object.keys(body).filter(key => !['phone', 'consent', 'requestId', 'assessmentId', 'website'].includes(key)), []);
  assert.equal(typeof body.phone, 'string');
  assert([testPhone, otherPhone].map(value => value.replace(/\D/g, '')).includes(body.phone.replace(/\D/g, '')));
  assert.equal(body.consent, true, 'Unchecked consent must never reach the API');
  assert.match(body.requestId, uuid, 'Each contact request requires a UUID');
  if (body.assessmentId !== undefined) assert.match(body.assessmentId, /^AS360-/);
  if (body.website !== undefined) assert.equal(body.website, '', 'Ordinary visitors must leave the honeypot empty');
  return body;
}

async function saved(route, body, notification = 'sent') {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, receiptId: body.requestId, notification }) });
}

async function createSession(width = 390, handler = (route, body) => saved(route, body), options = {}) {
  const height = width < 700 ? 844 : 900;
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const state = { context, page: await context.newPage(), width, height, calls: [], unexpectedWrites: [], errors: [] };
  state.page.on('pageerror', error => state.errors.push(error.message));
  // Intercept at context scope, including form navigations. A bug must never
  // forward a test phone number to the production API, Apps Script or mailbox.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === endpoint.origin && url.pathname === endpoint.pathname) {
      const body = requestBody(request);
      state.calls.push(body);
      return handler(route, body, state.calls.length - 1);
    }
    if (!['GET', 'HEAD'].includes(request.method())) {
      state.unexpectedWrites.push({ method: request.method(), origin: url.origin, path: url.pathname });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  if (options.clock) await state.page.clock.install();
  if (options.blockStorage) await state.page.addInitScript(() => { Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  const response = await state.page.goto(baseURL + '/consultation', { waitUntil: 'networkidle' });
  assert(response?.ok());
  await state.page.getByRole('button', { name: '상담 신청하기', exact: true }).waitFor();
  return state;
}

const phoneField = state => state.page.getByLabel('전화번호', { exact: true });
const consentField = state => state.page.getByRole('checkbox', { name: /전화번호.*동의/ });
const submitButton = state => state.page.getByRole('button', { name: '상담 신청하기', exact: true });
const retryButton = state => state.page.getByRole('button', { name: '다시 접수 확인하기', exact: true });

async function fillContact(state, phone = testPhone) {
  await phoneField(state).fill(phone);
  await consentField(state).check();
}

async function callsAtLeast(state, count) {
  const deadline = Date.now() + 10_000;
  while (state.calls.length < count) {
    if (Date.now() >= deadline) throw new Error(`Expected ${count} intercepted contact request(s), received ${state.calls.length}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function noPhonePersistence(state) {
  const savedValues = await state.page.evaluate(() => JSON.stringify({ session: { ...sessionStorage }, local: { ...localStorage } }));
  for (const phone of [testPhone, otherPhone]) {
    assert(!savedValues.includes(phone) && !savedValues.includes(phone.replace(/\D/g, '')), 'Contact phone must not be stored in browser storage');
  }
}

async function receipt(state, notification = 'sent') {
  const success = state.page.locator('[data-consultation-state="success"]');
  await success.waitFor();
  const latest = state.calls.at(-1);
  assert(latest);
  assert.equal(await success.getAttribute('data-receipt-id'), latest.requestId, 'Only the saved response may provide the receipt');
  assert.equal(await success.getAttribute('data-notification'), notification);
  const heading = state.page.getByRole('heading', { name: '상담 신청이 접수되었습니다.', exact: true });
  await heading.waitFor();
  await state.page.waitForFunction(() => document.activeElement?.textContent === '상담 신청이 접수되었습니다.');
  assert.equal(await state.page.locator('input[type="tel"]').count(), 0);
  assert.equal(await state.page.locator('[data-consultation-state="error"]').count(), 0);
  await noPhonePersistence(state);
}

async function failedInput(state, phone = testPhone) {
  await state.page.locator('[data-consultation-state="error"][role="alert"]').waitFor();
  assert.equal(await state.page.getByRole('heading', { name: '상담 신청이 접수되었습니다.', exact: true }).count(), 0, 'An uncertain or failed request must not claim receipt');
  assert.equal(await phoneField(state).inputValue(), phone, 'Failure must preserve the phone for retry');
  assert.equal(await consentField(state).isChecked(), true, 'Failure must preserve consent');
  assert(await retryButton(state).isEnabled());
  await noPhonePersistence(state);
}

async function finish(state, name, details = {}) {
  assert.deepEqual(state.errors, [], 'No client exceptions');
  assert.deepEqual(state.unexpectedWrites, [], 'Every automated contact write must remain inside the mock');
  results.push({ case: name, width: state.width, interceptedRequests: state.calls.length, externalWrites: 0, ...details });
  await state.page.screenshot({ path: path.join(output, `consultation-${name}-${state.width}.png`), fullPage: true });
  await state.context.close();
}

let fatal;
try {
  for (const width of [375, 390, 430, 768, 1440]) {
    const state = await createSession(width);
    const { page } = state;
    assert.equal(await page.getByRole('textbox').count(), 1, 'Only one visible phone field');
    assert.equal(await page.locator('textarea, select').count(), 0, 'Do not require a long enquiry form');
    assert.equal(await page.locator('[data-assessment-id]').count(), 0, 'Contact-only visitors must not receive a fabricated assessment');
    assert.equal(await page.getByRole('link', { name: '010-8930-9642', exact: true }).getAttribute('href'), 'tel:01089309642');
    assert.equal(await page.getByRole('link', { name: 'khcho@hangilac.co.kr', exact: true }).getAttribute('href'), 'mailto:khcho@hangilac.co.kr');
    const submit = submitButton(state);
    const box = await submit.boundingBox();
    assert(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= state.height + 1, `Contact CTA must fit the first viewport at ${width}: ${JSON.stringify(box)}`);
    assert(await submit.evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); }), 'Contact CTA must not be covered');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No mobile horizontal overflow');
    await submit.click();
    await page.getByText('전화번호를 입력해 주세요.', { exact: true }).waitFor();
    assert.equal(await page.locator(':focus').getAttribute('id'), 'contact-phone');
    for (const invalid of ['abc', '---', '123', '+', '-01012345678', '1234567890123456']) {
      await phoneField(state).fill(invalid);
      await submit.click();
      assert(await page.getByText('연락 가능한 전화번호를 확인해 주세요.', { exact: true }).isVisible());
    }
    await phoneField(state).fill(testPhone);
    await phoneField(state).press('Enter');
    await page.getByText('상담 연락처 전달에 동의해 주세요.', { exact: true }).waitFor();
    assert.equal(await page.locator(':focus').getAttribute('type'), 'checkbox');
    assert.equal(state.calls.length, 0, 'Validation must run before any contact request');
    await consentField(state).check();
    await phoneField(state).press('Enter');
    await receipt(state);
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].assessmentId, undefined, 'Assessment is optional');
    await page.screenshot({ path: path.join(output, `consultation-confirmation-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '새로운 상담 신청', exact: true }).click();
    assert.equal(await phoneField(state).inputValue(), '');
    assert.equal(await consentField(state).isChecked(), false);
    await phoneField(state).fill(testPhone);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await phoneField(state).inputValue(), '', 'Phone must not persist on reload');
    await page.goto(baseURL + '/consultation?demo=1', { waitUntil: 'networkidle' });
    await page.locator('[data-assessment-id]').waitFor();
    const id = await page.locator('[data-assessment-id]').getAttribute('data-assessment-id');
    assert((await page.getByRole('link', { name: '결과 보기', exact: true }).getAttribute('href')).includes(id));
    assert(!(await page.locator('body').innerText()).includes(id), 'Do not display long diagnostic IDs');
    await page.goto(baseURL + '/consultation?assessment_id=AS360-MISMATCH', { waitUntil: 'networkidle' });
    await page.getByText(/진단 ID가 달라/).waitFor();
    assert.equal(await page.locator('[data-assessment-id]').count(), 0, 'Never attach mismatched results');
    assert.equal(await page.getByRole('link', { name: '결과 보기', exact: true }).count(), 0);
    assert(await submitButton(state).isEnabled());
    await finish(state, 'validation-success', { validationBeforeRequest: true, optionalAssessment: true, phonePersistence: false, clippedControls: false });
  }

  const serverFailure = await createSession(390, async (route, body, index) => index === 0
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: '잠시 후 접수 상태를 다시 확인해 주세요.' }, retryable: true }) })
    : saved(route, body));
  await fillContact(serverFailure);
  await submitButton(serverFailure).click();
  await failedInput(serverFailure);
  await retryButton(serverFailure).click();
  await receipt(serverFailure);
  assert.deepEqual(serverFailure.calls[0], serverFailure.calls[1], 'Retry must reuse both the UUID and unchanged payload');
  await finish(serverFailure, 'server-failure-retry', { sameRequestId: true, inputPreserved: true });

  const reloaded = await createSession(390, async (route, body, index) => index === 0
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: '접수 상태를 확인하지 못했습니다.' }, retryable: true }) })
    : saved(route, body));
  await fillContact(reloaded);
  await submitButton(reloaded).click();
  await failedInput(reloaded);
  const firstRequest = reloaded.calls[0];
  const pendingEntries = await reloaded.page.evaluate(requestId => Object.entries(sessionStorage).flatMap(([key, value]) => {
    try {
      const record = JSON.parse(value);
      return record?.requestId === requestId ? [[key, record]] : [];
    } catch { return []; }
  }), firstRequest.requestId);
  assert.equal(pendingEntries.length, 1, 'An uncertain request needs one tab-scoped retry metadata record');
  const [pendingKey, pendingMetadata] = pendingEntries[0];
  assert.equal(pendingKey, 'as360.consultation.pending.v1');
  assert.deepEqual(Object.keys(pendingMetadata).sort(), ['createdAt', 'fingerprintHash', 'randomSalt', 'requestId'], 'Retry storage must contain metadata only, never phone, consent or diagnosis');
  assert.match(pendingMetadata.requestId, uuid);
  assert.match(pendingMetadata.randomSalt, uuid, 'The retry fingerprint needs a random salt');
  assert.match(pendingMetadata.fingerprintHash, /^[0-9a-f]{64}$/i, 'Persist only the salted SHA-256 fingerprint');
  assert.equal(typeof pendingMetadata.createdAt, 'number');
  assert(Math.abs(Date.now() - pendingMetadata.createdAt) < 60_000, 'Retry metadata must have a recent creation time');
  assert.equal(await reloaded.page.evaluate(key => localStorage.getItem(key), pendingKey), null, 'Retry metadata is tab-scoped, not persistent local storage');
  await noPhonePersistence(reloaded);
  await reloaded.page.reload({ waitUntil: 'networkidle' });
  assert.equal(await phoneField(reloaded).inputValue(), '', 'Reload must not restore the phone number');
  assert.equal(await consentField(reloaded).isChecked(), false, 'Reload requires fresh consent');
  await fillContact(reloaded);
  await submitButton(reloaded).click();
  await receipt(reloaded);
  assert.deepEqual(reloaded.calls[0], reloaded.calls[1], 'A same-tab reload must retry the same content with the original UUID');
  assert.equal(await reloaded.page.evaluate(key => sessionStorage.getItem(key), pendingKey), null, 'Confirmed storage must immediately clear the retry metadata');
  await finish(reloaded, 'reload-retry', { sameRequestId: true, phoneRestored: false, consentRestored: false, pendingMetadataCleared: true });

  let releaseTimedOut;
  const timeoutGate = new Promise(resolve => { releaseTimedOut = resolve; });
  const timeout = await createSession(390, async (route, body, index) => {
    if (index !== 0) return saved(route, body);
    await timeoutGate;
    // The first request was aborted by the browser. Do not forward it anywhere.
    await route.abort('timedout').catch(() => {});
  }, { clock: true });
  try {
    await fillContact(timeout);
    await submitButton(timeout).click();
    await callsAtLeast(timeout, 1);
    await timeout.page.clock.fastForward(56_000);
    await failedInput(timeout);
    await retryButton(timeout).click();
    await receipt(timeout);
    assert.deepEqual(timeout.calls[0], timeout.calls[1], 'A response lost after storage must retry the original idempotency key');
    releaseTimedOut();
    await finish(timeout, 'timeout-retry', { sameRequestId: true, inputPreserved: true, clockAdvancedMs: 56_000 });
  } finally { releaseTimedOut(); }

  const pending = await createSession(375, (route, body) => saved(route, body, 'pending'));
  await fillContact(pending);
  await submitButton(pending).click();
  await receipt(pending, 'pending');
  const pendingText = await pending.page.locator('[data-consultation-state="success"]').innerText();
  assert(pendingText.includes('접수대장에 저장') && pendingText.includes('알림이 지연') && pendingText.includes('다시 신청하지 않'), 'Pending notification must explain that storage succeeded and no resubmission is needed');
  assert.equal(await retryButton(pending).count(), 0, 'Pending mail must not ask the visitor to submit again');
  assert.equal(pending.calls.length, 1);
  await finish(pending, 'saved-mail-pending', { notificationPending: true, receiptSaved: true, resubmitRequested: false });

  let releaseDouble;
  const doubleGate = new Promise(resolve => { releaseDouble = resolve; });
  const doubleClick = await createSession(390, async (route, body) => { await doubleGate; await saved(route, body); });
  try {
    await fillContact(doubleClick);
    await doubleClick.page.getByRole('form', { name: '상담 연락처 접수', exact: true }).evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await callsAtLeast(doubleClick, 1);
    await doubleClick.page.waitForTimeout(150);
    assert.equal(doubleClick.calls.length, 1, 'Rapid duplicate submission must create only one request');
    assert(await doubleClick.page.getByRole('button', { name: '접수 중…', exact: true }).isDisabled());
    assert(await phoneField(doubleClick).isDisabled());
    assert(await consentField(doubleClick).isDisabled());
    assert.equal(await doubleClick.page.locator('[data-consultation-state="success"]').count(), 0, 'Do not claim receipt before the saved response');
    releaseDouble();
    await receipt(doubleClick);
    await finish(doubleClick, 'duplicate-submit', { requestsSent: 1, controlsLockedUntilReceipt: true });
  } finally { releaseDouble(); }

  const uncertain = await createSession(390, async (route, body, index) => index === 0
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, receiptId: '00000000-0000-4000-8000-000000000000', notification: 'sent' }) })
    : saved(route, body));
  await fillContact(uncertain);
  await submitButton(uncertain).click();
  await failedInput(uncertain);
  await retryButton(uncertain).click();
  await receipt(uncertain);
  assert.deepEqual(uncertain.calls[0], uncertain.calls[1], 'A response with a mismatched receipt must retry the original request');
  await finish(uncertain, 'mismatched-receipt', { falseConfirmation: false, sameRequestId: true });

  const edited = await createSession(390, async (route, body, index) => index === 0
    ? route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: '접수 상태를 확인하지 못했습니다.' }, retryable: true }) })
    : saved(route, body));
  await fillContact(edited);
  await submitButton(edited).click();
  await failedInput(edited);
  await phoneField(edited).fill(otherPhone);
  await submitButton(edited).click();
  await receipt(edited);
  assert.notEqual(edited.calls[0].requestId, edited.calls[1].requestId, 'A deliberately changed phone must get a new request key');
  assert.notEqual(edited.calls[0].phone, edited.calls[1].phone);
  await finish(edited, 'edited-after-failure', { changedPayloadHasNewKey: true });

  const blocked = await createSession(390, (route, body) => saved(route, body), { blockStorage: true });
  await fillContact(blocked);
  await submitButton(blocked).click();
  await blocked.page.locator('[data-consultation-state="success"]').waitFor();
  assert.equal(blocked.calls.length, 1, 'Contact reception must work when diagnosis storage is unavailable');
  await finish(blocked, 'blocked-storage', { diagnosisStorageRequired: false });
} catch (error) {
  fatal = error;
  const failurePage = browser.contexts().flatMap(context => context.pages()).at(-1);
  if (failurePage) await failurePage.screenshot({ path: path.join(output, 'consultation-failure.png'), fullPage: true }).catch(() => {});
} finally {
  await writeFile(path.join(output, 'consultation-contact-audit.json'), JSON.stringify({ status: fatal ? 'failed' : 'passed', baseURL, syntheticInputsOnly: true, contactPostsMocked: true, realRegisterOrMailWrites: 0, results, ...(fatal ? { error: String(fatal.stack ?? fatal) } : {}) }, null, 2));
  await browser.close();
}
if (fatal) throw fatal;
console.log(`Contact audit passed: ${results.length} cases; validation, saved receipts, failure/timeout retry, pending notification, duplicate submission and five viewports. Real contact deliveries: 0.`);
