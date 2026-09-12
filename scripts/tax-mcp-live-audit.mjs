import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Pass the actual edited repository path");
const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" }).trim();
assert.equal(path.resolve(gitRoot).toLowerCase(), root.toLowerCase());
const output = path.join(root, ".tmp", "tax-mcp-live");
await mkdir(output, { recursive: true });
const hashes = {};
for (const name of ["tax-grounding", "tax-mcp"]) {
  const source = await readFile(path.join(root, "lib", "chat", `${name}.ts`), "utf8");
  hashes[name] = createHash("sha256").update(source).digest("hex");
  await writeFile(path.join(output, `${name}.js`), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText);
}
const require = createRequire(import.meta.url);
const { planTaxQuery } = require(path.join(output, "tax-grounding.js"));
const { researchTaxQuestion } = require(path.join(output, "tax-mcp.js"));
const questions = ["상속 공제는 무엇을 확인하나요?", "증여 공제는 무엇을 확인하나요?", "양도세 비과세 요건을 알려주세요", "가업승계 요건을 알려주세요"];
const results = [];
for (const question of questions) {
  const started = Date.now();
  const query = planTaxQuery(question);
  const result = await researchTaxQuestion(query);
  results.push({ question, query, status: result.status, sources: result.sources, toolStatuses: result.toolStatuses, elapsedMs: Date.now() - started });
  console.log(`${question}: ${result.status}, ${result.sources.length} sources, ${Date.now() - started}ms`);
}
const dir = path.join(root, "artifacts", "phase2-tax-chat");
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, "live-mcp.json"), JSON.stringify({ scope: "actual application MCP adapter; no AI call", root, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), hashes, checkedAt: new Date().toISOString(), results }, null, 2));
assert.ok(results.every(result => ["ready", "partial"].includes(result.status) && result.sources.length > 0), "One or more actual MCP queries failed; inspect recorded statuses");
