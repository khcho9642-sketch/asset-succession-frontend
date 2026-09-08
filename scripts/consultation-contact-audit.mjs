import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const output = '.tmp/consultation-contact';
const testPhone = '000-0000-0000'; // Synthetic; never call or send.
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [375, 390, 430, 768, 1440]) {
    const height = width < 700 ? 844 : 900;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (!['GET', 'HEAD'].includes(request.method()) || request.url().includes(testPhone)) writes.push(request.url());
    });
    const response = await page.goto(baseURL + '/consultation', { waitUntil: 'networkidle' });
    assert(response.ok());
    assert.equal(await page.getByRole('textbox').count(), 1, 'Only one phone field');
    assert.equal(await page.locator('textarea, select').count(), 0, 'No long enquiry form');
    assert.equal(await page.locator('[data-assessment-id]').count(), 0, 'No fabricated assessment');
    assert.equal(await page.getByRole('link', { name: '010-8930-9642', exact: true }).getAttribute('href'), 'tel:01089309642');
    assert.equal(await page.getByRole('link', { name: 'khcho@hangilac.co.kr', exact: true }).getAttribute('href'), 'mailto:khcho@hangilac.co.kr');
    const submit = page.getByRole('button', { name: '연락처 남기기', exact: true });
    assert.equal(await submit.count(), 1);
    const box = await submit.boundingBox();
    assert(box.y + box.height <= height, 'Contact CTA should fit the first viewport at ' + width);
    assert(box.height >= 44);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(!await page.getByText('사전진단 결과가 연결되어 있습니다.').count());
    await page.screenshot({ path: path.join(output, width + '-contact.png'), fullPage: true });

    await submit.click();
    await page.getByText('전화번호를 입력해 주세요.', { exact: true }).waitFor();
    assert.equal(await page.locator(':focus').getAttribute('id'), 'contact-phone');
    const phone = page.getByLabel('전화번호', { exact: true });
    for (const invalid of ['abc', '---', '123', '+', '-01012345678', '1234567890123456']) {
      await phone.fill(invalid);
      await submit.click();
      assert(await page.getByText('연락 가능한 전화번호를 확인해 주세요.', { exact: true }).isVisible());
    }
    await phone.fill(testPhone);
    await phone.press('Enter');
    assert(await page.getByText('전화번호 이용에 동의해 주세요.', { exact: true }).isVisible());
    assert.equal(await page.locator(':focus').getAttribute('type'), 'checkbox');
    await page.getByRole('checkbox', { name: /전화번호 이용/ }).check();
    await phone.press('Enter');
    await page.getByRole('heading', { name: '연락처 입력을 확인했습니다.' }).waitFor();
    assert((await page.locator('body').innerText()).includes('실제 접수·전송은 되지 않았습니다.'));
    assert(!(await page.locator('body').innerText()).includes('접수되었습니다.'));
    assert.equal(await page.locator('input[type="tel"]').count(), 0);
    assert.equal(await page.locator(':focus').innerText(), '연락처 입력을 확인했습니다.');
    assert.equal(writes.length, 0, 'Must not transmit contact details');
    assert(!await page.evaluate((value) => JSON.stringify({ ...sessionStorage, ...localStorage }).includes(value), testPhone));
    await page.screenshot({ path: path.join(output, width + '-confirmation.png'), fullPage: true });
    await page.getByRole('button', { name: '다시 입력하기' }).click();
    assert.equal(await phone.inputValue(), '');
    await phone.fill(testPhone);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await phone.inputValue(), '', 'Phone must not be persisted on reload');

    await page.goto(baseURL + '/consultation?demo=1', { waitUntil: 'networkidle' });
    await page.locator('[data-assessment-id]').waitFor();
    const id = await page.locator('[data-assessment-id]').getAttribute('data-assessment-id');
    assert((await page.getByRole('link', { name: '결과 보기', exact: true }).getAttribute('href')).includes(id));
    assert(!(await page.locator('body').innerText()).includes(id), 'Do not show long diagnostic IDs');
    assert(!(await page.locator('body').innerText()).includes('가족 및 자산 구조'), 'Do not repeat diagnostic summaries');
    if (width === 390 || width === 1440) await page.screenshot({ path: path.join(output, width + '-linked.png'), fullPage: true });
    await page.goto(baseURL + '/consultation?assessment_id=AS360-MISMATCH', { waitUntil: 'networkidle' });
    await page.getByText(/진단 ID가 달라/).waitFor();
    assert.equal(await page.locator('[data-assessment-id]').count(), 0, 'Never attach mismatched results');
    assert.equal(await page.getByRole('link', { name: '결과 보기', exact: true }).count(), 0);
    assert(await submit.isEnabled(), 'Contact-only form remains available without linked diagnosis');
    assert.deepEqual(errors, []);
    results.push({ width, height, overflow: false, singlePhoneField: true, validation: 'passed', optionalAssessment: 'passed', noTransmissionOrPersistence: true, consoleErrors: errors });
    await context.close();
  }
  const blocked = await browser.newPage();
  await blocked.addInitScript(() => { Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  await blocked.goto(baseURL + '/consultation', { waitUntil: 'networkidle' });
  assert(await blocked.getByRole('button', { name: '연락처 남기기', exact: true }).isEnabled());
  await blocked.close();
  await writeFile(path.join(output, 'audit.json'), JSON.stringify(results, null, 2));
  console.log('Contact audit passed: five viewports, single phone field, validation/focus, optional/mismatched assessment, blocked storage, no transmission or persistence.');
} finally { await browser.close(); }
