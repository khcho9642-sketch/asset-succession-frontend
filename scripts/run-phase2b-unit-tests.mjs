import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "phase2b-unit-tests");
const files = [
  "lib/phase2b/types.ts",
  "lib/phase2b/calculation.ts",
  "lib/phase2b/fixtures.ts",
  "lib/phase2b/engine.ts",
  "scripts/phase2b-unit-tests.ts"
];

await rm(outDir, { recursive: true, force: true });

for (const file of files) {
  const input = path.join(root, file);
  const source = await readFile(input, "utf8");
  const output = ts.transpileModule(source, {
    fileName: input,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      strict: true
    },
    reportDiagnostics: true
  });

  const diagnostics = output.diagnostics ?? [];
  if (diagnostics.length > 0) {
    const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n"
    });
    console.error(message);
    process.exit(1);
  }

  const relativeOut = file.replace(/\.ts$/, ".js");
  const target = path.join(outDir, relativeOut);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, output.outputText, "utf8");
}

const result = spawnSync(process.execPath, ["--test", path.join(outDir, "scripts", "phase2b-unit-tests.js")], {
  cwd: outDir,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
