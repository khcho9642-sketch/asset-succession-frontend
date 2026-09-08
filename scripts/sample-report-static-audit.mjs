import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

// Run after npm run build. This is a static/export audit, not a browser test.
const html = await readFile('out/sample-report.html', 'utf8');
const home = await readFile('out/index.html', 'utf8');
assert(html.includes('7장 샘플 보고서'));
assert(html.includes('큰 글씨 요약'));
assert(html.includes('2배 확대'));
assert(html.includes('샘플 · 가상 사례'));
assert(html.includes('전문가 검토 전'));
assert(home.includes('href="/sample-report"'));
for (let i = 1; i <= 7; i++) {
  const path = `public/media/sample-report/page-0${i}.webp`;
  const bytes = await readFile(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${path}: missing RIFF header`);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `${path}: not a WebP`);
  assert(bytes.length > 10000 && bytes.length < 300000, `${path}: unexpected size`);
  assert.equal((await stat(path.replace('public/', 'out/'))).size, bytes.length);
  assert(html.includes(`value="${i - 1}"`), `Missing page option ${i}`);
}
const viewer = await readFile('components/SampleReportViewer.tsx', 'utf8');
assert(!/sessionStorage|localStorage|readAssessmentFromSession|setInterval|setTimeout/.test(viewer));
assert(viewer.includes('scrollIntoView'));
assert(viewer.includes('다시 불러오기'));
console.log('Sample report static audit passed: 7 exported images, page selector, reading controls, homepage link, disclaimers, no assessment storage or autoplay. Browser interaction/layout not tested by this script.');
