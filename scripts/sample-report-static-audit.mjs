import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// Preserve the earlier approved assets while serving the explicitly requested redesign.
const originalImages = [
  [1052, 1494, "4067fae4241482d9d5549d2e500f65cfea31c9a13df13c2bdc930bd5ab4a5560"],
  [1052, 1494, "0889ee78f1e92d12e2ef2d98c1c27636c9216b5ffc664bcfbe451eaa9157f6e4"],
  [1052, 1495, "39424b3ba76067e913b5ff77bb8232c9ce2b2d969df9222bdf4a0556b3f249be"],
  [1052, 1495, "192b92ddcfb7379600fed4a54072de28001215cbb3bf7910c71ec25a44b74a9f"],
  [1054, 1492, "afbdf6ab1d546d21428961d9c5c6e2a4637027154b66a99dddbb974dbc151891"],
  [1053, 1493, "bf2e9b32149b7bd210eb3a8e39b6c63144e7c527cae646b312592f4af659f02e"],
  [1052, 1495, "67e39a50525cb200432aaf8adbbf9977efdd6d714b753bc7589e125ecf99f7f4"],
].map(([width, height, sha256], index) => ({ width, height, sha256, src: `/media/sample-report/page-${String(index + 1).padStart(2, "0")}.webp` }));

for (const image of originalImages) {
  const bytes = await readFile(`public${image.src}`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), image.sha256, `Approved sample image changed: ${image.src}`);
}

const manifest = JSON.parse(await readFile("public/media/sample-report-v3/manifest.json", "utf8"));
const titles = ["세금효과 요약", "가족과 자산", "세 가지 방향 비교", "단계적 증여", "매각과 상속", "생활비와 납부재원", "실행 준비"];
assert.equal(manifest.version, 5, "Sample must use the approved v5 illustrated seven-page manifest");
assert.deepEqual(manifest.pages.map(page => page.title), titles, "The requested seven infographic chapters changed");
assert.equal(manifest.pdf, "/media/sample-report-v3/sample-report-layout-v5.pdf", "Sample download must use the matching illustrated PDF");
for (const [index, page] of manifest.pages.entries()) {
  const expectedImage = index === 0 ? "/media/sample-report-v3/page-01-layout-v5.webp" : `/media/sample-report-v3/page-${String(index + 1).padStart(2, "0")}.webp`;
  assert.equal(page.image, expectedImage);
  assert.equal(page.width, 1400);
  assert.equal(page.height, 1980);
  assert(page.headline && page.points.length >= 2, `Page ${index + 1} needs an accessible summary`);
  const bytes = await readFile(`public${page.image}`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), page.sha256, `Image differs from its generated manifest: ${page.image}`);
}
const pdfBytes = await readFile(`public${manifest.pdf}`);
assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-", "Sample download is not a PDF");

// Run after npm run build. All seven infographics and accessible summaries precede hydration.
const html = await readFile(".next/server/app/sample-report.html", "utf8");
const home = await readFile(".next/server/app/index.html", "utf8");
const prerender = JSON.parse(await readFile(".next/prerender-manifest.json", "utf8"));
assert(prerender.routes["/sample-report"], "Sample report must remain prerendered");
assert(prerender.routes["/"], "Homepage must remain prerendered");
assert(home.includes('href="/sample-report"'), "Homepage lost its sample report link");

function auditMarkup(source, label) {
  // React's serialized payload is not rendered content and cannot satisfy this audit.
  const markup = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert(markup.includes("data-sample-image-report"), `${label}: missing infographic report`);
  assert(!markup.includes('data-report-mode="tax-comparison"'), `${label}: a customer report replaced the public sample`);
  const pages = [...markup.matchAll(/<section\b[^>]*data-report-page="(\d+)"[^>]*>/g)];
  assert.deepEqual(pages.map(page => page[1]), ["1", "2", "3", "4", "5", "6", "7"], `${label}: seven infographic pages must be rendered in order`);
  assert.equal([...markup.matchAll(/<img\b[^>]*data-sample-page-image/g)].length, 7, `${label}: expected exactly seven report images`);
  for (const [index, page] of pages.entries()) {
    const section = markup.slice(page.index, pages[index + 1]?.index ?? markup.length);
    const image = section.match(/<img\b[^>]*data-sample-page-image[^>]*>/)?.[0];
    const expected = manifest.pages[index];
    assert(image, `${label}: page ${page[1]} has no infographic`);
    assert(image.includes(`src="${expected.image}"`), `${label}: page ${page[1]} shows the wrong image`);
    assert(image.includes(`width="${expected.width}"`) && image.includes(`height="${expected.height}"`), `${label}: page ${page[1]} lost its intrinsic image dimensions`);
    assert(/alt="[^"]{10,}"/.test(image), `${label}: page ${page[1]} needs descriptive alternative text`);
    assert(section.includes("샘플") && section.includes("전문가 검토 전"), `${label}: page ${page[1]} lost its accessible sample status`);
    assert(markup.includes(`id="report-page-${page[1]}"`), `${label}: page ${page[1]} has no navigation target`);
  }
  const firstPage = markup.slice(pages[0].index, pages[1].index);
  for (const phrase of ["상속재산 52억원", "14.91억원", "9.16억원", "5.75억원"]) assert(firstPage.includes(phrase), `${label}: first-page v5 inheritance summary lost ${phrase}`);
  assert(firstPage.includes("첫 장은 별도 상속세 비교 예시"), `${label}: first-page example must identify its limited comparison scope`);
  const fourthPage = markup.slice(pages[3].index, pages[4].index);
  for (const amount of ["4,850,000원", "14,550,000원"]) assert(fourthPage.includes(amount), `${label}: fourth-page gift-tax example lost ${amount}`);
  for (const amount of ["1,491,375,000원", "1,200,375,000원", "774,060,000원", "426,315,000원"]) assert(!markup.includes(amount), `${label}: unrelated estate-tax calculation leaked into the illustrated sample`);
  assert(new RegExp(`<a\\b[^>]*href="${manifest.pdf}"[^>]*download=`).test(markup), `${label}: PDF control must download the matching report file`);
  assert(markup.includes("data-sample-viewer") && markup.includes('data-current-page="1"'), `${label}: missing initial one-page viewer state`);
  assert(markup.includes("data-sample-stage"), `${label}: missing fitted report stage`);
  for (const control of ["목차", "이전 페이지", "다음 페이지", "크게 보기", "PDF 저장"]) assert(markup.includes(control), `${label}: missing ${control} control`);
  assert(markup.includes('href="/"'), `${label}: missing / link`);
  assert(markup.includes('href="/precheck?purpose=inheritance"'), `${label}: missing inheritance precheck link`);
}

auditMarkup(html, "Prerendered sample");
if (process.env.BASE_URL) {
  const response = await fetch(new URL("/sample-report", process.env.BASE_URL));
  assert(response.ok, `Sample route returned ${response.status}`);
  auditMarkup(await response.text(), "Served sample");
}
console.log("Sample report static audit passed: earlier images preserved, seven illustrated image hashes match the manifest, scoped gift-tax effect summary prerendered, matching PDF download and homepage entry present.");
