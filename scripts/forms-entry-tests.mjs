import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const out = path.resolve(".tmp/forms-entry-tests");
mkdirSync(out, { recursive: true });
for (const name of ["entry"]) {
  const input = readFileSync(`lib/forms/${name}.ts`, "utf8");
  writeFileSync(path.join(out, `${name}.cjs`), ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const require = createRequire(import.meta.url);
const { formsHrefFromPrecheck } = require(path.join(out, "entry.cjs"));
const fact = value => ({ value, evidence: value, messageId: "test" });
const state = (topic, timing) => ({ facts: { topic: fact(topic), ...(timing ? { timing: fact(timing) } : {}), financialAssets: fact("private account should not be in URL") } });

test("precheck preserves inheritance/business timing and never transmits private facts", () => {
  for (const topic of ["상속", "가업상속"]) {
    const before = new URL(formsHrefFromPrecheck(state(topic, "상속을 미리 준비 중이에요")), "https://example.test");
    assert.equal(before.searchParams.get("timing"), "before_death");
    const after = new URL(formsHrefFromPrecheck(state(topic, "이미 상속이 발생했어요")), "https://example.test");
    assert.equal(after.searchParams.get("timing"), "after_death");
    const unknown = new URL(formsHrefFromPrecheck(state(topic, "아직 잘 모르겠어요")), "https://example.test");
    assert.equal(unknown.searchParams.get("timing"), null);
    assert.equal(unknown.searchParams.get("stage"), null);
    assert.ok(!unknown.href.includes("private"));
  }
  assert.equal(formsHrefFromPrecheck({ facts: {} }), "/forms");
  for (const topic of ["증여", "양도"]) {
    assert.equal(new URL(formsHrefFromPrecheck(state(topic)), "https://example.test").searchParams.get("timing"), "before_death");
    assert.equal(new URL(formsHrefFromPrecheck(state(topic, "이미 상속이 발생했어요")), "https://example.test").searchParams.get("timing"), "before_death");
  }
  assert.equal(new URL(formsHrefFromPrecheck(state("상속, 증여", "이미 상속이 발생했어요")), "https://example.test").searchParams.get("timing"), null);
  assert.equal(formsHrefFromPrecheck({ facts: { topic: { ...fact("상속"), status: "needs_confirmation" } } }), "/forms");
});
