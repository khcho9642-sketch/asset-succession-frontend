import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const out = path.resolve(".tmp/forms-planning-tests");
mkdirSync(out, { recursive: true });
for (const name of ["entry", "planning"]) {
  const input = readFileSync(`lib/forms/${name}.ts`, "utf8");
  writeFileSync(path.join(out, `${name}.cjs`), ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const require = createRequire(import.meta.url);
const { formsHrefFromPrecheck } = require(path.join(out, "entry.cjs"));
const { sanitizePlanningAnswers, planningSummary, planningNumberError, getPlanningDraft, savePlanningDraft, clearPlanningDraft, collectPlanningSummaries } = require(path.join(out, "planning.cjs"));
const resources = JSON.parse(readFileSync("lib/forms/planning-content.json", "utf8")).resources;
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

test("all six templates resolve without injecting values into other placeholders", () => {
  assert.equal(resources.length, 6);
  for (const resource of resources) {
    assert.ok(!planningSummary(resource, {}).includes("{{"));
    for (const question of resource.sections.flatMap(section => section.questions)) assert.equal(question.required, false);
  }
  const resource = resources[0];
  const result = planningSummary(resource, { estimated_assets: "0", owner_role: "{{family_context}}" });
  assert.ok(result.includes("0 만원"));
  assert.ok(!result.includes("만원 만원"));
  assert.ok(result.includes("{{family_context}}"));
  assert.ok(!planningSummary(resource, {}).includes("미입력 만원"));
});

test("restored planning drafts discard unknown fields and invalid choices; exclusive selections stay exclusive", () => {
  const resource = resources[0];
  const cleaned = sanitizePlanningAnswers(resource, { privateId: "never retain", asset_types: ["real_estate", "unknown", "invented"], estimated_assets: "-1", owner_role: "부모님" });
  assert.equal(cleaned.privateId, undefined);
  assert.equal(cleaned.estimated_assets, undefined);
  assert.deepEqual(cleaned.asset_types, ["unknown"]);
  assert.equal(cleaned.owner_role, "부모님");
  assert.deepEqual(sanitizePlanningAnswers(resource, null), {});
});

test("live summary export rejects invalid amounts and choices and formats valid amount units", () => {
  const resource = resources[0];
  for (const value of ["-1", "NaN", "Infinity", "1e3", "1.001", "1000000000001"]) {
    assert.ok(planningNumberError(value));
    assert.equal(sanitizePlanningAnswers(resource, { estimated_assets: value }).estimated_assets, undefined);
    assert.ok(!planningSummary(resource, { estimated_assets: value }).includes(`${value} 만원`));
  }
  assert.equal(planningNumberError(".5"), null);
  assert.equal(planningNumberError("0"), null);
  assert.ok(planningSummary(resource, { estimated_assets: ".5" }).includes("0.5 만원"));
  assert.ok(planningSummary(resource, { estimated_assets: "12000.50" }).includes("12,000.5 만원"));
  assert.ok(!planningSummary(resource, { asset_types: "invented" }).includes("invented"));
  assert.ok(planningSummary(resource, { asset_types: ["real_estate"] }).includes("부동산"));
  assert.equal(planningSummary(resource, {}).split(resource.title).length - 1, 1);
});

test("worksheets share only explicitly selected in-memory drafts and clear independently", () => {
  for (const resource of resources) clearPlanningDraft(resource.id);
  savePlanningDraft(resources[0], { owner_role: "부모님", estimated_assets: "0", privateId: "discard" });
  savePlanningDraft(resources[1], { people: "본인과 자녀" });
  assert.equal(getPlanningDraft(resources[0]).privateId, undefined);
  const restored = getPlanningDraft(resources[0]);
  restored.owner_role = "외부 변경";
  assert.equal(getPlanningDraft(resources[0]).owner_role, "부모님");
  let collected = collectPlanningSummaries(resources, ["PLAN-01"]);
  assert.equal(collected.summaries.length, 1);
  assert.ok(collected.summaries[0].includes("부모님"));
  assert.ok(!collected.summaries[0].includes("본인과 자녀"));
  assert.deepEqual(collectPlanningSummaries(resources, ["none"]).summaries, []);
  clearPlanningDraft("PLAN-01");
  collected = collectPlanningSummaries(resources, ["PLAN-01", "PLAN-02"]);
  assert.deepEqual(collected.missing, [resources[0].title]);
  assert.equal(collected.summaries.length, 1);
  assert.ok(collected.summaries[0].includes("본인과 자녀"));
  for (const resource of resources) clearPlanningDraft(resource.id);
});

test("planning workspace stores no worksheet facts in persistent browser storage or URL parameters", () => {
  const workspace = readFileSync("app/forms/planning/PlanningWorkspace.tsx", "utf8");
  const helpers = readFileSync("lib/forms/planning.ts", "utf8");
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(workspace + helpers));
  assert.ok(!/fetch\s*\(|sendBeacon\s*\(|URLSearchParams/.test(workspace));
});
