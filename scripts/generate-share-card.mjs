import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createElement: h } = require("react");
const { ImageResponse } = require("next/og");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontFile = process.argv[2] ?? "C:/Windows/Fonts/malgun.ttf";
const boldFontFile = process.argv[3] ?? "C:/Windows/Fonts/malgunbd.ttf";
const text = (value, style = {}) => h("div", { style: { display: "flex", ...style } }, value);
const row = (number, label, detail) => h("div", {
  style: { display: "flex", alignItems: "center", gap: 20, padding: "24px 0", borderBottom: "1px solid #deddd7" },
},
  text(number, { fontSize: 18, color: "#aa3f30" }),
  h("div", { style: { display: "flex", flexDirection: "column", gap: 7 } },
    text(label, { fontSize: 25, fontWeight: 700 }),
    text(detail, { fontSize: 17, color: "#68726d" }),
  ),
);

const tree = h("div", {
  style: {
    width: "100%", height: "100%", display: "flex", position: "relative",
    background: "#f5f3ee", color: "#252a27", fontFamily: "ShareSans",
    padding: "56px 60px", letterSpacing: 0,
  },
},
  h("div", { style: { position: "absolute", left: 0, top: 0, right: 0, height: 10, background: "#aa3f30" } }),
  h("div", { style: { width: 650, display: "flex", flexDirection: "column", position: "relative" } },
    text("자산승계 360", { fontSize: 68, lineHeight: 1.2, fontWeight: 700 }),
    text("ASSET SUCCESSION", { fontSize: 16, marginTop: 13, color: "#68726d" }),
    h("div", { style: { display: "flex", flexDirection: "column", marginTop: 48, gap: 10, fontSize: 43, fontWeight: 700, lineHeight: 1.3 } },
      text("오늘의 준비가"), text("내일의 가족을 지킵니다."),
    ),
    text("상속 · 증여 · 양도 · 가업승계", { marginTop: 26, fontSize: 26, color: "#59645d" }),
    text("asset360.intellic.co.kr", { position: "absolute", bottom: 1, fontSize: 22, color: "#aa3f30", fontWeight: 700 }),
  ),
  h("div", { style: {
    position: "absolute", top: 60, right: 60, width: 365, height: 510,
    background: "#ffffff", border: "1px solid #deddd7", borderRadius: 4,
    padding: "30px 28px", display: "flex", flexDirection: "column",
    boxShadow: "0 12px 24px rgba(37,42,39,0.08)",
  } },
    text("우리 가족의 다음을 위해", { fontSize: 17, color: "#68726d" }),
    text("자산승계 준비 노트", { fontSize: 29, fontWeight: 700, marginTop: 12, paddingBottom: 20, borderBottom: "3px solid #2f5a4b" }),
    row("01", "가족과 자산 정리", "현재 상황부터 차근차근"),
    row("02", "승계 방향 비교", "가족의 우선순위에 맞게"),
    row("03", "필요한 서류 준비", "자료실에서 한눈에"),
    text("사전진단  /  자료실", { fontSize: 17, color: "#2f5a4b", marginTop: 22 }),
  ),
);

const response = new ImageResponse(tree, {
  width: 1200, height: 630,
  fonts: [
    { name: "ShareSans", data: await readFile(fontFile), weight: 400, style: "normal" },
    { name: "ShareSans", data: await readFile(boldFontFile), weight: 700, style: "normal" },
  ],
});
if (!response.ok) throw new Error(`Image rendering failed: ${response.status}`);
const output = path.join(root, "public/media/asset360-share-20261116.png");
await writeFile(output, Buffer.from(await response.arrayBuffer()));
console.log(output);
