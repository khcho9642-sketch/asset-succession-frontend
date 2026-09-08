import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const output = path.join(root, ".tmp", "tax-comparison-tests");
async function filesIn(folder) {
  const entries = await readdir(path.join(root, folder), { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(path.join(folder, entry.name)) : [path.join(folder, entry.name)]));
  return nested.flat().filter(file => file.endsWith(".ts"));
}
const tests = ["scripts/tax-inheritance-gift-tests.ts", "scripts/tax-capital-business-tests.ts", "scripts/tax-comparison-tests.ts", "scripts/tax-housing-tests.ts", "scripts/tax-business-inheritance-tests.ts", "scripts/tax-snapshot-tests.ts"];
await rm(output, { recursive: true, force: true });
for (const file of [...await filesIn("lib"), ...tests]) {
  const source = await readFile(path.join(root, file), "utf8");
  const transpiled = ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, strict: true } });
  const destination = path.join(output, file.replace(/\.ts$/, ".js"));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, transpiled.outputText);
}
const result = spawnSync(process.execPath, ["--test", ...tests.map(file => path.join(output, file.replace(/\.ts$/, ".js")))], { cwd: output, stdio: "inherit" });
process.exit(result.status ?? 1);
