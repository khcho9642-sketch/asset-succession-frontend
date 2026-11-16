import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { parse } = require("next/dist/compiled/node-html-parser");
const sharp = require("sharp");
const base = process.env.BASE_URL ?? "http://127.0.0.1:4176";
const canonicalOrigin = "https://asset360.intellic.co.kr";
const imagePath = "/media/asset360-share-20261116.png";
const routes = [
  ["/", "자산승계 360 | 우리 가족의 자산승계 준비"],
  ["/?share=20261116", "자산승계 360 | 우리 가족의 자산승계 준비"],
  ["/forms", "상속·증여 서류 자료실 | 자산승계 360"],
  ["/forms?view=all", "상속·증여 서류 자료실 | 자산승계 360"],
  ["/sample-report", "7장 샘플 보고서 | 자산승계 360"],
];

for (const [route, title] of routes) {
  await test(`Crawler receives a complete share card for ${route}`, async () => {
    const response = await fetch(new URL(route, base), {
      headers: { "User-Agent": "facebookexternalhit/1.1; kakaotalk-scrap/1.0" },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200);
    const document = parse(await response.text());
    const head = document.querySelector("head");
    const meta = (name) => head.querySelector(`meta[property='${name}'],meta[name='${name}']`)?.getAttribute("content");
    assert.equal(head.querySelector("title").textContent, title);
    assert.equal(meta("og:title"), title);
    assert.equal(meta("og:description"), meta("description"));
    assert.ok(meta("og:description").length > 25);
    assert.equal(meta("og:image"), canonicalOrigin + imagePath);
    assert.equal(meta("og:image:width"), "1200");
    assert.equal(meta("og:image:height"), "630");
    assert.ok(meta("og:image:alt").includes("자산승계"));
    assert.equal(meta("og:type"), "website");
    assert.equal(meta("og:locale"), "ko_KR");
    assert.equal(meta("twitter:card"), "summary_large_image");
    assert.equal(meta("twitter:image"), canonicalOrigin + imagePath);
    assert.equal(new URL(meta("og:url")).href, new URL(new URL(route, base).pathname, canonicalOrigin).href);
    assert.equal(new URL(head.querySelector("link[rel=canonical]").getAttribute("href")).href, new URL(meta("og:url")).href);
  });
}

await test("Share image is a public, nonblank 1200 x 630 PNG", async () => {
  const response = await fetch(new URL(imagePath, base), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/png/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length < 1_000_000);
  const image = sharp(bytes);
  const metadata = await image.metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  const stats = await image.stats();
  assert.ok(stats.channels.slice(0, 3).every(channel => channel.stdev > 15));
});
