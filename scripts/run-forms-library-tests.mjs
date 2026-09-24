import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const out = mkdtempSync(join(tmpdir(), 'forms-library-tests-'));
const run = (program, args) => execFileSync(program, args, { stdio: 'inherit' });
try {
  run(process.env.PYTHON || 'python', ['scripts/validate-forms-taxonomy.py']);
  run(process.execPath, ['scripts/forms-catalog-tests.mjs']);
  run(process.execPath, ['scripts/forms-preview-integration-tests.mjs']);
  run(process.execPath, ['scripts/forms-entry-tests.mjs']);
  run(process.execPath, ['scripts/forms-life-guides-tests.mjs']);
  run(process.execPath, ['scripts/forms-preview-counts-tests.mjs']);
  run(process.execPath, ['scripts/forms-preview-policy-tests.mjs']);
  run(process.execPath, ['scripts/forms-individual-catalog-tests.mjs']);
  run(process.execPath, ['scripts/forms-current-preview-tests.mjs']);
  run(process.execPath, ['scripts/forms-prd-tests.mjs']);
  run(process.execPath, ['scripts/forms-bank-tests.mjs']);
  run(process.execPath, ['scripts/forms-final-review-tests.mjs']);
  run(process.execPath, ['scripts/forms-review-ledger.mjs']);
  run(process.execPath, ['node_modules/typescript/bin/tsc', 'lib/forms/catalog.ts', 'lib/forms/catalog.test.ts', '--outDir', out, '--target', 'es2022', '--module', 'commonjs', '--esModuleInterop', '--skipLibCheck']);
  writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}');
  run(process.execPath, ['--test', join(out, 'catalog.test.js')]);
} finally { rmSync(out, { recursive: true, force: true }); }
