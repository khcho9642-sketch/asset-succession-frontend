import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

// Reuse the application's calculator; the report artist never invents a tax amount.
const temp = path.resolve('.tmp/sample-infographic-engine');
await mkdir(temp, { recursive: true });
for (const name of ['common', 'types', 'inheritance-gift']) {
  const source = await readFile(`lib/tax-comparison/${name}.ts`, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  await writeFile(path.join(temp, `${name}.js`), compiled.outputText);
}
const { compareInheritance } = createRequire(import.meta.url)(path.join(temp, 'inheritance-gift.js'));
const input = { version: 1, track: 'inheritance', confirmed: true, confirmedAt: '2026-09-08T00:00:00.000Z', values: {
  estate: '50', financial: '10', debt: '5', financialDebt: '5', funeral: '0.05',
  spouse: 'yes', children: '3', resident: 'yes', standardCase: 'yes', availableCash: '',
} };
const cases = [5, 10, 15].map((allocation, index) => {
  const comparison = compareInheritance({ ...input, values: { ...input.values, spouseAllocation: String(allocation) } });
  assert.equal(comparison.status, 'ready');
  const result = comparison.alternatives.find(option => option.id === 'inheritance-custom-spouse');
  assert(result);
  return { ...result, code: 'ABC'[index], label: `배우자 ${allocation}억 배분`, spouseAllocationWon: allocation * 100_000_000 };
});
assert.deepEqual(cases.map(row => row.totalTaxWon), [1_200_375_000, 968_060_000, 774_060_000]);
const cash = { depositsWon: 1_000_000_000, repayDebtWon: 500_000_000, funeralWon: 5_000_000, livingReserveWon: 500_000_000 };
cash.availableWon = cash.depositsWon - cash.repayDebtWon - cash.funeralWon;
cash.requiredWon = cases[2].totalTaxWon + cash.livingReserveWon;
cash.shortfallWon = cash.requiredWon - cash.availableWon;
const data = { version: 2, lawCheckedOn: '2026-09-08', input, cases, differenceWon: cases[0].totalTaxWon - cases[2].totalTaxWon, cash };
await writeFile('lib/sampleInfographicScenario.json', JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ taxes: cases.map(row => row.totalTaxWon), differenceWon: data.differenceWon, cashShortfallWon: cash.shortfallWon }));
