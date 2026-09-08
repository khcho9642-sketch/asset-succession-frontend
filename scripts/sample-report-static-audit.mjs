import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// The approved public sample is the original seven images, not a customer tax calculation.
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

// Run after npm run build. All original images and accessible summaries must precede hydration.
const html = await readFile(".next/server/app/sample-report.html", "utf8");
const home = await readFile(".next/server/app/index.html", "utf8");
const prerender = JSON.parse(await readFile(".next/prerender-manifest.json", "utf8"));
assert(prerender.routes["/sample-report"], "Sample report must remain prerendered");
assert(prerender.routes["/"], "Homepage must remain prerendered");
assert(home.includes('href="/sample-report"'), "Homepage lost its sample report link");

function auditMarkup(source, label) {
  // React's serialized payload is not rendered content and cannot satisfy this audit.
  const markup = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert(markup.includes("data-sample-image-report"), `${label}: missing original image report`);
  assert(!markup.includes('data-report-mode="tax-comparison"'), `${label}: a different tax report replaced the approved images`);
  const pages = [...markup.matchAll(/<section\b[^>]*data-report-page="(\d+)"[^>]*>/g)];
  assert.deepEqual(pages.map(page => page[1]), ["1", "2", "3", "4", "5", "6", "7"], `${label}: seven original pages must be rendered in order`);
  assert.equal([...markup.matchAll(/<img\b[^>]*data-sample-page-image/g)].length, 7, `${label}: expected exactly seven report images`);
  for (const [index, page] of pages.entries()) {
    const section = markup.slice(page.index, pages[index + 1]?.index ?? markup.length);
    const image = section.match(/<img\b[^>]*data-sample-page-image[^>]*>/)?.[0];
    const original = originalImages[index];
    assert(image, `${label}: page ${page[1]} has no original report image`);
    assert(image.includes(`src="${original.src}"`), `${label}: page ${page[1]} shows the wrong image`);
    assert(image.includes(`width="${original.width}"`) && image.includes(`height="${original.height}"`), `${label}: page ${page[1]} lost its intrinsic image dimensions`);
    assert(/alt="[^"]{10,}"/.test(image), `${label}: page ${page[1]} needs descriptive alternative text`);
    assert(section.includes("샘플") && section.includes("전문가 검토 전"), `${label}: page ${page[1]} lost its accessible sample status`);
    assert(markup.includes(`id="report-page-${page[1]}"`), `${label}: page ${page[1]} has no navigation target`);
  }
  for (const amount of ["50억 원", "5억 원", "45억 원"]) assert(markup.includes(amount), `${label}: original family sample summary lost ${amount}`);
  assert(!markup.includes("1,491,375,000원"), `${label}: unrelated 52억원 calculation leaked into the original image sample`);
  assert(markup.includes("data-sample-viewer") && markup.includes('data-current-page="1"'), `${label}: missing initial one-page viewer state`);
  assert(markup.includes("data-sample-stage"), `${label}: missing fitted report stage`);
  for (const control of ["목차", "이전 페이지", "다음 페이지", "크게 보기", "PDF 저장"]) assert(markup.includes(control), `${label}: missing ${control} control`);
  for (const href of ["/", "/precheck"]) assert(markup.includes(`href="${href}"`), `${label}: missing ${href} link`);
}

auditMarkup(html, "Prerendered sample");
if (process.env.BASE_URL) {
  const response = await fetch(new URL("/sample-report", process.env.BASE_URL));
  assert(response.ok, `Sample route returned ${response.status}`);
  auditMarkup(await response.text(), "Served sample");
}
console.log("Sample report static audit passed: unchanged seven approved image hashes, prerendered images and accessible summaries, original 50/5/45억원 sample, navigation targets and homepage entry.");
