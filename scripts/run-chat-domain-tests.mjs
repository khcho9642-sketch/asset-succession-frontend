import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "chat-domain-tests");
const files = [
  "lib/assessment.ts", "lib/chat/intake.ts", "lib/chat/report.ts", "lib/chat/local.ts",
  "lib/chat/server.ts", "lib/chat/agent.ts", "lib/chat/prompt.ts", "lib/chat/server.test.ts", "app/api/diagnosis/route.ts",
  "lib/chat/guide.ts", "lib/chat/guide.test.ts",
  "lib/phase2b/types.ts", "lib/phase2b/calculation.ts", "lib/phase2b/money.ts",
  "lib/phase2b/tax.ts", "lib/phase2b/conversation.ts", "lib/phase2b/normalize.ts",
  "lib/phase2b/fixtures.ts", "lib/phase2b/engine.ts", "scripts/chat-domain-tests.ts"
];

await rm(outDir, { recursive: true, force: true });
for (const file of files) {
  const input = path.join(root, file);
  const source = await readFile(input, "utf8");
  const output = ts.transpileModule(source, {
    fileName: input,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, strict: true },
    reportDiagnostics: true
  });
  if (output.diagnostics?.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(output.diagnostics, {
      getCanonicalFileName: (name) => name, getCurrentDirectory: () => root, getNewLine: () => "\n"
    }));
    process.exit(1);
  }
  const target = path.join(outDir, file.replace(/\.ts$/, ".js"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, output.outputText, "utf8");
}
await writeFile(path.join(outDir, "CHAT_GUIDE.md"), await readFile(path.join(root, "CHAT_GUIDE.md")));
const result = spawnSync(process.execPath, ["--test", path.join(outDir, "scripts", "chat-domain-tests.js"), path.join(outDir, "lib", "chat", "server.test.js"), path.join(outDir, "lib", "chat", "guide.test.js")], { cwd: outDir, stdio: "inherit" });
process.exit(result.status ?? 1);
