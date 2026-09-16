# PR #4 Simple Calculator Customer UX Result

## Scope

- Updated the existing PR #4 calculator instead of replacing the tax calculation module.
- Kept the calculator on `assistant/simple-tax-calculator`.
- Did not change chat, MCP, forms library, reports, environment variables, production deployment, or project settings.

## Customer UX Changes

- First entry now starts with empty customer-input state for all tax types.
- Existing virtual values moved to `예시 불러오기`.
- `초기화` clears the current tax type input, result, and example notice instead of restoring example values.
- Tax-type switching preserves each tax type's own input and result separately.
- Money fields format pasted and typed numbers with comma separators, show `원`, and display a Korean amount helper such as `12억 원`.
- Blank, explicit `0원`, and `모름` remain distinct. Only confirmed `없음` options are treated as zero or not applicable.
- Results move focus to the result panel, show tax due first, and hide detailed lines behind expandable sections.
- Edited inputs invalidate the previous result and show `다시 계산 필요` instead of emphasizing stale tax.

## Calculation Input Changes

- Customers no longer directly enter spouse statutory share numerator/denominator, minor deduction amount, or disabled deduction amount.
- Supported inheritance family share is derived for simple spouse/children cases:
  - spouse only: `1/1`
  - spouse plus children: spouse `1.5`, each child `1`
  - no spouse: spouse deduction not shown or applied
- Minor deduction is derived from minor ages using `미성년자수 x 1천만원 x 19세까지 잔여연수`.
- Disabled deduction is derived from the entered life-expectancy year total using `1천만원 x 기대여명 연수`.
- Capital gains holding period is derived from acquisition and transfer dates.

## Official Basis Checked

- NTS inheritance personal deduction guidance: child, minor, senior, disabled, and lump-sum deductions.
- NTS gift tax calculation flow and deduction table: spouse, lineal ascendant, lineal descendant, relatives, unrelated persons, tax brackets, generation-skipping surcharge.
- NTS capital gains guidance: calculation flow, progressive tax rates, basic deduction, long-term holding deduction concept.

Official pages were reachable during implementation:

- `https://j.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7956`
- `https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7728&mi=2340`
- `https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7960&mi=6538`
- `https://in.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7710&mi=2311`

## Official Calculator Comparison

- Official basis pages and the mobile Hometax input page were reachable.
- Direct live result comparison against a public NTS calculator result endpoint was not completed because no stable public result API was identified during this pass.
- The implementation therefore records this as `공식 계산기 직접 결과 대조 미실행`, while preserving existing arithmetic and boundary regression tests.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm run test:simple-calculator`
- `npm run test:tax`
- `npm run test:chat`
- `npm run test:phase2b`
- `npm run build`
- `python scripts/simple-calculator-ui-audit.py`

UI audit covered:

- first access has no virtual amount/family defaults
- example load shows virtual example notice and calculates
- reset clears input/result/example notice
- direct customer input calculates
- edited input invalidates prior result until recalculation
- spouse/children and additional conditions update calculated inputs
- `있음` to `없음` excludes prior detail values
- blank, zero, unknown, unsupported conditions remain distinct
- tax type switching preserves each type separately
- comma paste, mid-string amount edit, and mobile numeric inputs
- 1440px, 390px, and 360px screenshots and horizontal overflow checks

Evidence:

- Before captures: `.tmp/simple-calculator-before/`
- After captures and verification JSON: `.tmp/simple-calculator-proof/`
