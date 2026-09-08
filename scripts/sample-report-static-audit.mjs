import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Run after npm run build. The complete sample must be present before hydration.
const html = await readFile(".next/server/app/sample-report.html", "utf8");
const home = await readFile(".next/server/app/index.html", "utf8");
const prerender = JSON.parse(await readFile(".next/prerender-manifest.json", "utf8"));
assert(prerender.routes["/sample-report"], "Sample report must remain prerendered");
assert(prerender.routes["/"], "Homepage must remain prerendered");
assert(home.includes('href="/sample-report"'), "Homepage lost its sample report link");

function auditMarkup(source, label) {
  // React's serialized payload is not rendered content and cannot satisfy this audit.
  const markup = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.equal([...markup.matchAll(/data-report-template="paper-seven-v1"/g)].length, 1, `${label}: missing shared paper template`);
  assert(markup.includes('data-report-mode="tax-comparison"'), `${label}: missing actual tax report`);
  assert(markup.includes('data-tax-report-status="ready"'), `${label}: sample calculation is incomplete`);
  const pages = [...markup.matchAll(/<section\b[^>]*data-report-page="(\d+)"[^>]*>/g)];
  assert.deepEqual(pages.map(page => page[1]), ["1", "2", "3", "4", "5", "6", "7"], `${label}: all seven report pages must be rendered in order`);
  for (const [index, page] of pages.entries()) {
    const section = markup.slice(page.index, pages[index + 1]?.index ?? markup.length);
    assert(section.includes("data-report-content"), `${label}: page ${page[1]} has no report content`);
    assert(section.includes("샘플"), `${label}: page ${page[1]} lost its sample label`);
    assert(section.includes("전문가 검토 전"), `${label}: page ${page[1]} lost its review disclaimer`);
    assert(markup.includes(`id="report-page-${page[1]}"`), `${label}: page ${page[1]} has no navigation target`);
  }
  for (const [marker, amount] of [["baseline", "1,491,375,000원"], ["alternative", "916,326,660원"], ["difference", "575,048,340원"]]) {
    assert(markup.includes(`data-tax-report-${marker}`) && markup.includes(amount), `${label}: missing calculated ${marker} amount`);
  }
  assert(markup.includes('data-tax-cash-status="unknown"'), `${label}: unknown payment cash was inferred`);
  assert(!/<img\b[^>]*(?:src|srcset)="[^"]*\/media\/sample-report\//i.test(markup), `${label}: obsolete raster report is still displayed`);
  assert(markup.includes('aria-label="보고서 목차"'), `${label}: missing report contents navigation`);
  for (const href of ["/", "/precheck"]) assert(markup.includes(`href="${href}"`), `${label}: missing ${href} link`);
}

auditMarkup(html, "Prerendered sample");
if (process.env.BASE_URL) {
  const response = await fetch(new URL("/sample-report", process.env.BASE_URL));
  assert(response.ok, `Sample route returned ${response.status}`);
  auditMarkup(await response.text(), "Served sample");
}
console.log("Sample report static audit passed: prerendered seven-page paper tax report, sample labels, calculated amounts, unknown payment cash, navigation targets and homepage entry.");
