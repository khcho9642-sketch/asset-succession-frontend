"use client";

import { AlertTriangle, Calculator, CheckCircle2, ClipboardList, Info, RotateCcw } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  calculateCapitalGainsTax,
  calculateDisabledDeductionFromLifeExpectancyYears,
  calculateGiftTax,
  calculateInheritanceTax,
  calculateMinorDeductionFromAges,
  deriveSpouseLegalShare,
  formatKoreanWon,
  formatWon,
  fullYearsBetween,
  MAX_SIMPLE_CALCULATOR_WON,
  SIMPLE_CALCULATOR_CHECKED_ON,
} from "@/lib/simple-calculator";
import type {
  CapitalGainsInput,
  GiftInput,
  InheritanceInput,
  InheritancePriorGift,
  SimpleCalculationResult,
  SimpleTaxKind,
  UnsupportedItem,
} from "@/lib/simple-calculator";
import styles from "./calculator.module.css";

type FormValues = Record<string, string | boolean>;
type ConditionValue = "" | "no" | "yes" | "unknown";

const tabs: Array<{ kind: SimpleTaxKind; label: string; caption: string }> = [
  { kind: "inheritance", label: "상속세", caption: "재산·가족관계" },
  { kind: "gift", label: "증여세", caption: "증여일·관계" },
  { kind: "capitalGains", label: "양도소득세", caption: "취득·양도금액" },
];

const blankForms: Record<SimpleTaxKind, FormValues> = {
  inheritance: {
    deathDate: "",
    familyType: "",
    childrenCount: "",
    realEstateWon: "",
    financialAssetsWon: "",
    financialExclusionsStatus: "",
    financialExclusionsWon: "",
    otherAssetsWon: "",
    spouseActualInheritanceWon: "",
    deemedAssetsStatus: "",
    deemedAssetsWon: "",
    nonTaxableStatus: "",
    nonTaxableWon: "",
    debtStatus: "",
    debtWon: "",
    financialDebtWon: "",
    publicChargesStatus: "",
    publicChargesWon: "",
    funeralStatus: "",
    funeralWon: "",
    burialStatus: "",
    burialWon: "",
    seniorStatus: "",
    seniorCount: "",
    minorStatus: "",
    minorAges: "",
    disabledStatus: "",
    disabledLifeYears: "",
    priorGiftStatus: "",
    priorGiftCount: "",
  },
  gift: {
    giftDate: "",
    resident: "",
    relationship: "",
    amountWon: "",
    debtStatus: "",
    debtAssumedWon: "",
    priorGiftStatus: "",
    priorGiftWon: "",
    previousTaxKnown: "",
    previousTaxPaidWon: "",
    priorGiftDeductionWon: "",
    otherGiftDeductionStatus: "",
    otherGiftDeductionWon: "",
    appraisalStatus: "",
    appraisalFeeWon: "",
    marriageBirthStatus: "",
    marriageBirthEvent: "",
    marriageBirthEventDate: "",
    marriageBirthUsedStatus: "",
    marriageBirthPreviouslyUsedWon: "",
    generationSkipStatus: "",
    minorOverTwoBillion: false,
  },
  capitalGains: {
    resident: "",
    acquisitionDate: "",
    transferDate: "",
    assetType: "",
    salePriceWon: "",
    purchasePriceWon: "",
    expenseStatus: "",
    necessaryExpenseWon: "",
    otherGainStatus: "",
    otherCapitalGainWon: "",
    otherGainDirection: "",
    otherGainsGeneralRate: "",
    previousCapitalTaxStatus: "",
    previousNationalTaxWon: "",
    previousLocalTaxWon: "",
    basicDeductionStatus: "",
    basicDeductionUsedWon: "",
    residenceStatus: "",
    residenceYears: "",
    homeCount: "",
    homeOwnership: "",
    householdOtherRights: "",
    regulatedAtAcquisition: "",
    homeSpecialConditions: "",
  },
};

const exampleForms: Record<SimpleTaxKind, FormValues> = {
  inheritance: {
    ...blankForms.inheritance,
    deathDate: "2026-09-16",
    familyType: "spouseChildren",
    childrenCount: "2",
    realEstateWon: "1,200,000,000",
    financialAssetsWon: "200,000,000",
    financialExclusionsStatus: "no",
    otherAssetsWon: "100,000,000",
    spouseActualInheritanceWon: "500,000,000",
    deemedAssetsStatus: "no",
    nonTaxableStatus: "no",
    debtStatus: "yes",
    debtWon: "100,000,000",
    financialDebtWon: "100,000,000",
    publicChargesStatus: "no",
    funeralStatus: "yes",
    funeralWon: "8,000,000",
    burialStatus: "no",
    seniorStatus: "no",
    minorStatus: "no",
    disabledStatus: "no",
    priorGiftStatus: "no",
  },
  gift: {
    ...blankForms.gift,
    giftDate: "2026-09-16",
    resident: "yes",
    relationship: "linealAscendantAdult",
    amountWon: "100,000,000",
    debtStatus: "no",
    priorGiftStatus: "no",
    otherGiftDeductionStatus: "no",
    appraisalStatus: "no",
    marriageBirthStatus: "no",
    generationSkipStatus: "no",
  },
  capitalGains: {
    ...blankForms.capitalGains,
    resident: "yes",
    acquisitionDate: "2016-09-15",
    transferDate: "2026-09-16",
    assetType: "generalBuilding",
    salePriceWon: "900,000,000",
    purchasePriceWon: "600,000,000",
    expenseStatus: "yes",
    necessaryExpenseWon: "30,000,000",
    otherGainStatus: "no",
    basicDeductionStatus: "no",
  },
};

const conditionOptions: Array<{ value: ConditionValue; label: string }> = [
  { value: "no", label: "없음" },
  { value: "yes", label: "있음" },
  { value: "unknown", label: "모름" },
];

function text(values: FormValues, key: string): string {
  return String(values[key] ?? "");
}

function parseMoneyText(raw: string): { status: "blank" | "invalid" | "overflow" | "valid"; value: number | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { status: "blank", value: null };
  if (/[^\d,\s]/.test(trimmed)) return { status: "invalid", value: null };
  const digits = trimmed.replace(/[,\s]/g, "");
  if (!digits) return { status: "blank", value: null };
  if (BigInt(digits) > BigInt(MAX_SIMPLE_CALCULATOR_WON)) return { status: "overflow", value: null };
  return { status: "valid", value: Number(digits) };
}

function formatMoneyText(raw: string): string {
  if (/[^\d,\s]/.test(raw)) return raw;
  const digits = raw.replace(/[,\s]/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function cursorPositionForDigitCount(value: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) seen += 1;
    if (seen >= digitCount) return index + 1;
  }
  return value.length;
}

function integer(values: FormValues, key: string): number | null {
  const raw = text(values, key).trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

function requiredInteger(values: FormValues, key: string, label: string, missing: string[], min = 0, max = 99): number | null {
  const value = integer(values, key);
  if (value === null || value < min || value > max) {
    missing.push(`${label}: ${min}~${max} 사이의 정수를 입력해 주세요.`);
    return null;
  }
  return value;
}

function requiredMoney(values: FormValues, key: string, label: string, missing: string[]): number | null {
  const parsed = parseMoneyText(text(values, key));
  if (parsed.status === "blank") missing.push(`${label}: 금액을 입력해 주세요. 없으면 0원을 입력해 주세요.`);
  if (parsed.status === "invalid") missing.push(`${label}: 숫자와 쉼표만 입력해 주세요.`);
  if (parsed.status === "overflow") missing.push(`${label}: 허용 범위 ${formatWon(MAX_SIMPLE_CALCULATOR_WON)} 이하로 입력해 주세요.`);
  return parsed.value;
}

function condition(values: FormValues, key: string): ConditionValue {
  const value = text(values, key) as ConditionValue;
  return value === "yes" || value === "no" || value === "unknown" ? value : "";
}

function optionalMoney(values: FormValues, statusKey: string, moneyKey: string, label: string, missing: string[]): number | null {
  const selected = condition(values, statusKey);
  if (selected === "no") return 0;
  if (selected === "unknown" || selected === "") {
    missing.push(`${label}: 없음·있음·모름 중 하나를 선택해 주세요.`);
    return null;
  }
  return requiredMoney(values, moneyKey, label, missing);
}

function parseAges(raw: string, missing: string[]): number[] | null {
  const parts = raw.split(/[,\s]+/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    missing.push("미성년 상속인 나이: 상속개시일 기준 만 나이를 입력해 주세요.");
    return null;
  }
  const ages = parts.map((part) => Number(part));
  if (ages.some((age) => !Number.isInteger(age) || age < 0 || age >= 19)) {
    missing.push("미성년 상속인 나이: 0~18 사이의 만 나이를 쉼표로 구분해 입력해 주세요.");
    return null;
  }
  return ages;
}

function makeBlockedResult(
  kind: SimpleTaxKind,
  title: string,
  missing: string[],
  unsupported: UnsupportedItem[],
): SimpleCalculationResult {
  return {
    kind,
    title,
    taxName: title.replace(" 간편계산", ""),
    status: unsupported.length ? "unsupported" : "needs_info",
    taxableBaseWon: 0,
    grossTaxWon: 0,
    creditWon: 0,
    nationalTaxWon: 0,
    localTaxWon: 0,
    totalTaxWon: 0,
    lines: [],
    missing,
    scopeNotes: [],
    unsupported,
    assumptions: [
      "계산을 막는 입력 또는 미지원 조건이 있어 세액을 산출하지 않았습니다.",
      "모름으로 표시한 항목은 0원이나 비적용으로 처리하지 않습니다.",
    ],
    references: [],
    checkedOn: SIMPLE_CALCULATOR_CHECKED_ON,
  };
}

function buildInheritanceInput(values: FormValues): { input: InheritanceInput | null; missing: string[]; unsupported: UnsupportedItem[]; derived: string[] } {
  const missing: string[] = [];
  const unsupported: UnsupportedItem[] = [];
  const derived: string[] = [];
  const familyType = text(values, "familyType");
  if (!text(values, "deathDate")) missing.push("상속개시일을 입력해 주세요.");
  if (!familyType) missing.push("가족관계를 선택해 주세요.");
  if (familyType === "other") unsupported.push({ label: "배우자·자녀 외 가족관계", reason: "현재 화면은 배우자와 자녀만 있는 단순 상속관계의 법정상속분 자동 산출을 지원합니다." });

  const spouse = familyType === "spouseChildren" || familyType === "spouseOnly" ? "yes" : "no";
  const spouseSoleHeir = familyType === "spouseOnly";
  const childrenCount = familyType === "spouseOnly" ? 0 : requiredInteger(values, "childrenCount", "법정상속 대상 자녀 수", missing, familyType === "spouseChildren" || familyType === "childrenOnly" ? 1 : 0, 20);
  const share = deriveSpouseLegalShare({ spouse, spouseSoleHeir, childrenCount });
  if (share.unsupported) unsupported.push({ label: share.label, reason: share.unsupported });
  if (!share.unsupported) derived.push(`배우자 법정상속분: ${share.label}`);

  const seniorCount = condition(values, "seniorStatus") === "no" ? 0 : condition(values, "seniorStatus") === "yes"
    ? requiredInteger(values, "seniorCount", "연로자 수", missing, 0, 20)
    : (missing.push("연로자 공제 대상: 없음·있음·모름 중 하나를 선택해 주세요."), null);
  const minorDeduction = condition(values, "minorStatus") === "no" ? 0 : condition(values, "minorStatus") === "yes"
    ? (() => {
      const ages = parseAges(text(values, "minorAges"), missing);
      if (!ages) return null;
      const amount = calculateMinorDeductionFromAges(ages);
      derived.push(`미성년자 공제: ${ages.map((age) => `만 ${age}세`).join(", ")} 기준 ${formatWon(amount)}`);
      return amount;
    })()
    : (missing.push("미성년자 공제 대상: 없음·있음·모름 중 하나를 선택해 주세요."), null);
  const disabledDeduction = condition(values, "disabledStatus") === "no" ? 0 : condition(values, "disabledStatus") === "yes"
    ? (() => {
      const years = requiredInteger(values, "disabledLifeYears", "장애인 기대여명 합계", missing, 0, 150);
      if (years === null) return null;
      const amount = calculateDisabledDeductionFromLifeExpectancyYears(years);
      derived.push(`장애인 공제: 기대여명 합계 ${years}년 기준 ${formatWon(amount)}`);
      return amount;
    })()
    : (missing.push("장애인 공제 대상: 없음·있음·모름 중 하나를 선택해 주세요."), null);

  const financialAssetsWon = requiredMoney(values, "financialAssetsWon", "금융재산가액", missing);
  const financialExclusionsWon = financialAssetsWon === 0 ? 0 : financialAssetsWon === null ? null
    : condition(values, "financialExclusionsStatus") === "unknown"
      ? (missing.push("금융재산 중 공제 제외 재산: 공제 대상 여부를 확인해 주세요. 모름 상태에서는 계산할 수 없습니다."), null)
      : optionalMoney(values, "financialExclusionsStatus", "financialExclusionsWon", "금융재산 중 공제 제외 재산", missing);
  let priorGifts: InheritancePriorGift[] | null = null;
  if (condition(values, "priorGiftStatus") === "no") priorGifts = [];
  else if (condition(values, "priorGiftStatus") === "yes") {
    const count = requiredInteger(values, "priorGiftCount", "사전증여 수증자 수", missing, 1, 21);
    if (count !== null) priorGifts = Array.from({ length: count }, (_, index) => {
      const prefix = `priorGift${index}`;
      const label = `사전증여 ${index + 1}`;
      const recipient = text(values, `${prefix}Recipient`);
      if (!["spouse", "child", "other"].includes(recipient)) missing.push(`${label} 수증자: 관계를 선택해 주세요.`);
      return {
        recipient: (recipient || null) as InheritancePriorGift["recipient"],
        propertyKind: (text(values, `${prefix}Kind`) || null) as InheritancePriorGift["propertyKind"],
        amountWon: requiredMoney(values, `${prefix}Amount`, `${label} 증여재산가액`, missing),
        taxableBaseWon: requiredMoney(values, `${prefix}Base`, `${label} 신고 과세표준`, missing),
        calculatedTaxWon: requiredMoney(values, `${prefix}Tax`, `${label} 신고 산출세액`, missing),
        creditEligible: (text(values, `${prefix}Eligible`) || null) as InheritancePriorGift["creditEligible"],
      };
    });
  } else missing.push("상속 전 사전증여: 없음·있음·모름 중 하나를 선택해 주세요.");
  const giftTotal = (recipient: InheritancePriorGift["recipient"], key: "amountWon" | "taxableBaseWon") => priorGifts === null ? null
    : priorGifts.filter(gift => gift.recipient === recipient).reduce((total, gift) => total + (gift[key] ?? 0), 0);
  const input: InheritanceInput = {
    deathDate: text(values, "deathDate"),
    spouse,
    spouseSoleHeir,
    childrenCount,
    minorDeductionWon: minorDeduction,
    seniorCount,
    disabledDeductionWon: disabledDeduction,
    realEstateWon: requiredMoney(values, "realEstateWon", "부동산가액", missing),
    financialAssetsWon,
    financialExclusionsWon,
    otherAssetsWon: requiredMoney(values, "otherAssetsWon", "기타재산가액", missing),
    deemedAssetsWon: optionalMoney(values, "deemedAssetsStatus", "deemedAssetsWon", "퇴직금·보험금·신탁재산 등", missing),
    nonTaxableWon: optionalMoney(values, "nonTaxableStatus", "nonTaxableWon", "비과세·과세가액 불산입액", missing),
    priorGiftSpouseWon: giftTotal("spouse", "amountWon"),
    priorGiftHeirsWon: giftTotal("child", "amountWon"),
    priorGiftOthersWon: giftTotal("other", "amountWon"),
    priorGifts,
    debtWon: optionalMoney(values, "debtStatus", "debtWon", "채무", missing),
    financialDebtWon: condition(values, "debtStatus") === "no" ? 0 : condition(values, "debtStatus") === "yes"
      ? requiredMoney(values, "financialDebtWon", "총채무 중 금융채무 금액", missing) : null,
    publicChargesWon: optionalMoney(values, "publicChargesStatus", "publicChargesWon", "공과금", missing),
    funeralWon: optionalMoney(values, "funeralStatus", "funeralWon", "일반 장례비용", missing),
    burialWon: optionalMoney(values, "burialStatus", "burialWon", "봉안시설·자연장지 비용", missing),
    spouseActualInheritanceWon: spouse === "yes" ? requiredMoney(values, "spouseActualInheritanceWon", "배우자가 실제로 상속받은 금액", missing) : 0,
    statutoryShareNumerator: share.numerator,
    statutoryShareDenominator: share.denominator,
    spousePriorGiftTaxableWon: giftTotal("spouse", "taxableBaseWon"),
  };
  return { input: missing.length || unsupported.length ? null : input, missing, unsupported, derived };
}

function buildGiftInput(values: FormValues): { input: GiftInput | null; missing: string[]; unsupported: UnsupportedItem[]; derived: string[] } {
  const missing: string[] = [];
  const unsupported: UnsupportedItem[] = [];
  const derived: string[] = [];
  if (!text(values, "giftDate")) missing.push("증여일을 입력해 주세요.");
  const resident = text(values, "resident");
  if (!resident) missing.push("수증자 거주자 여부를 선택해 주세요.");
  if (!text(values, "relationship")) missing.push("증여자와 수증자의 관계를 선택해 주세요.");
  const relationship = (text(values, "relationship") || "unrelated") as GiftInput["relationship"];
  const debtAssumedWon = optionalMoney(values, "debtStatus", "debtAssumedWon", "수증자 인수 채무", missing);
  const priorGiftStatus = condition(values, "priorGiftStatus");
  const priorGiftWon = priorGiftStatus === "no" ? 0 : priorGiftStatus === "yes"
    ? requiredMoney(values, "priorGiftWon", "최근 10년 동일인 관련 증여", missing)
    : (missing.push("최근 10년 동일인 관련 증여: 없음·있음·모름 중 하나를 선택해 주세요."), null);
  const previousTaxPaidWon = priorGiftStatus === "no" ? 0 : priorGiftStatus === "yes" && condition(values, "previousTaxKnown") === "yes"
    ? requiredMoney(values, "previousTaxPaidWon", "종전 증여재산 산출세액", missing)
    : priorGiftStatus === "yes"
      ? (missing.push("종전 증여재산 산출세액: 과거 증여가 있으면 확인된 금액이 필요합니다."), null)
      : null;
  const priorGiftDeductionWon = priorGiftStatus === "no" ? 0 : priorGiftStatus === "yes"
    ? requiredMoney(values, "priorGiftDeductionWon", "같은 증여자의 과거 증여에 적용한 공제", missing) : null;
  const otherGiftDeductionWon = optionalMoney(values, "otherGiftDeductionStatus", "otherGiftDeductionWon", "그 밖의 증여에서 사용한 같은 구분의 공제", missing);
  const appraisalFeeWon = optionalMoney(values, "appraisalStatus", "appraisalFeeWon", "감정평가수수료", missing);
  let marriageBirthDeductionWon = 0;
  let marriageBirthPreviouslyUsedWon: number | null = 0;
  if (condition(values, "marriageBirthStatus") === "yes") {
    if (relationship !== "linealAscendantAdult" && relationship !== "linealAscendantMinor") {
      unsupported.push({ label: "혼인·출산 증여재산공제", reason: "현재 화면은 직계존속 증여에서 요건 충족을 선택한 경우에만 최대 1억원 한도를 적용합니다." });
    } else {
      marriageBirthDeductionWon = 100_000_000;
      marriageBirthPreviouslyUsedWon = optionalMoney(values, "marriageBirthUsedStatus", "marriageBirthPreviouslyUsedWon", "이미 사용한 혼인·출산 공제", missing);
    }
  } else if (condition(values, "marriageBirthStatus") !== "no") {
    missing.push("혼인·출산 증여재산공제: 없음·있음·모름 중 하나를 선택해 주세요.");
  }
  const generationSkipStatus = condition(values, "generationSkipStatus");
  if (generationSkipStatus === "unknown" || generationSkipStatus === "") missing.push("세대생략 할증 여부를 선택해 주세요.");

  const input: GiftInput = {
    giftDate: text(values, "giftDate"),
    resident: resident === "no" ? "no" : "yes",
    relationship,
    amountWon: requiredMoney(values, "amountWon", "증여재산가액", missing),
    debtAssumedWon,
    priorGiftWon,
    priorGiftDeductionWon,
    otherGiftDeductionWon,
    appraisalFeeWon,
    marriageBirthDeductionWon,
    marriageBirthPreviouslyUsedWon,
    marriageBirthEvent: condition(values, "marriageBirthStatus") === "yes" ? (text(values, "marriageBirthEvent") || null) as GiftInput["marriageBirthEvent"] : null,
    marriageBirthEventDate: condition(values, "marriageBirthStatus") === "yes" ? text(values, "marriageBirthEventDate") || null : null,
    previousTaxPaidWon,
    generationSkip: generationSkipStatus === "yes",
    minorOverTwoBillion: values.minorOverTwoBillion === true,
  };
  return { input: missing.length || unsupported.length ? null : input, missing, unsupported, derived };
}

function buildCapitalInput(values: FormValues): { input: CapitalGainsInput | null; missing: string[]; unsupported: UnsupportedItem[]; derived: string[] } {
  const missing: string[] = [];
  const unsupported: UnsupportedItem[] = [];
  const derived: string[] = [];
  if (!text(values, "assetType")) missing.push("자산 종류를 선택해 주세요.");
  const assetType = (text(values, "assetType") || "otherUnsupported") as CapitalGainsInput["assetType"];
  if (assetType === "otherUnsupported") unsupported.push({ label: "분양권·입주권 등", reason: "자산별 중과·특례가 달라 이번 간편계산 범위에서 제외합니다." });
  const heldYears = fullYearsBetween(text(values, "acquisitionDate"), text(values, "transferDate"));
  if (heldYears === null) missing.push("취득일과 양도일을 올바르게 입력해 주세요.");
  else derived.push(`보유기간: 취득일·양도일 기준 만 ${heldYears}년`);
  const isHome = assetType === "oneHome";
  const residenceYears = isHome
    ? condition(values, "residenceStatus") === "no" ? 0 : condition(values, "residenceStatus") === "yes"
      ? requiredInteger(values, "residenceYears", "거주 연수", missing, 0, 99)
      : (missing.push("주택 거주기간: 없음·있음·모름 중 하나를 선택해 주세요."), null)
    : 0;
  const homeCount = isHome ? requiredInteger(values, "homeCount", "보유 주택 수", missing, 1, 20) : 0;
  const resident = text(values, "resident");
  if (resident !== "yes" && resident !== "no") missing.push("양도자 거주자 여부를 선택해 주세요.");
  if (isHome) {
    if (!text(values, "homeOwnership")) missing.push("주택 소유·취득 형태를 선택해 주세요.");
  }
  const annualAggregation = condition(values, "otherGainStatus") === "yes";
  const otherAmount = optionalMoney(values, "otherGainStatus", "otherCapitalGainWon", "같은 해 다른 양도소득금액", missing);
  const direction = text(values, "otherGainDirection");
  if (annualAggregation && direction !== "profit" && direction !== "loss") missing.push("다른 양도소득의 구분: 소득 또는 손실을 선택해 주세요.");
  const paidStatus = condition(values, "previousCapitalTaxStatus");
  if (annualAggregation && paidStatus !== "yes" && paidStatus !== "no") missing.push("같은 해 양도세 납부 이력: 없음·있음·모름 중 하나를 선택해 주세요.");
  const input: CapitalGainsInput = {
    transferDate: text(values, "transferDate"),
    acquisitionDate: text(values, "acquisitionDate"),
    assetType,
    salePriceWon: requiredMoney(values, "salePriceWon", "양도가액", missing),
    purchasePriceWon: requiredMoney(values, "purchasePriceWon", "취득가액", missing),
    necessaryExpenseWon: optionalMoney(values, "expenseStatus", "necessaryExpenseWon", "필요경비", missing),
    otherCapitalGainWon: otherAmount === null ? null : annualAggregation && direction === "loss" ? -otherAmount : otherAmount,
    basicDeductionUsedWon: optionalMoney(values, "basicDeductionStatus", "basicDeductionUsedWon", "이미 사용한 양도소득 기본공제", missing),
    annualAggregation,
    otherGainsGeneralRate: annualAggregation ? (text(values, "otherGainsGeneralRate") || null) as CapitalGainsInput["otherGainsGeneralRate"] : null,
    previousNationalTaxWon: !annualAggregation || paidStatus === "no" ? 0 : requiredMoney(values, "previousNationalTaxWon", "같은 해 이미 납부한 양도소득세", missing),
    previousLocalTaxWon: !annualAggregation || paidStatus === "no" ? 0 : requiredMoney(values, "previousLocalTaxWon", "같은 해 이미 납부한 지방소득세", missing),
    residenceYears,
    homeCount,
    resident: resident === "yes" || resident === "no" ? resident : null,
    homeOwnership: isHome ? (text(values, "homeOwnership") || null) as CapitalGainsInput["homeOwnership"] : null,
    householdOtherRights: isHome ? condition(values, "householdOtherRights") || null : null,
    regulatedAtAcquisition: isHome ? condition(values, "regulatedAtAcquisition") || null : null,
    homeSpecialConditions: isHome ? condition(values, "homeSpecialConditions") || null : null,
    regulatedArea: false,
  };
  return { input: missing.length || unsupported.length ? null : input, missing, unsupported, derived };
}

function calculate(kind: SimpleTaxKind, values: FormValues): SimpleCalculationResult {
  if (kind === "inheritance") {
    const built = buildInheritanceInput(values);
    if (!built.input) return makeBlockedResult(kind, "상속세 간편계산", built.missing, built.unsupported);
    const result = calculateInheritanceTax(built.input);
    result.assumptions = [...built.derived, ...result.assumptions];
    return result;
  }
  if (kind === "gift") {
    const built = buildGiftInput(values);
    if (!built.input) return makeBlockedResult(kind, "증여세 간편계산", built.missing, built.unsupported);
    const result = calculateGiftTax(built.input);
    result.assumptions = [...built.derived, ...result.assumptions];
    return result;
  }
  const built = buildCapitalInput(values);
  if (!built.input) return makeBlockedResult(kind, "양도소득세 간편계산", built.missing, built.unsupported);
  const result = calculateCapitalGainsTax(built.input);
  result.assumptions = [...built.derived, ...result.assumptions];
  return result;
}

function MoneyField({
  values,
  name,
  label,
  hint,
  onChange,
}: {
  values: FormValues;
  name: string;
  label: string;
  hint?: string;
  onChange: (name: string, value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<{ value: string; position: number } | null>(null);
  const value = text(values, name);
  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    pendingSelection.current = null;
    const input = inputRef.current;
    if (pending && input && input === document.activeElement && input.value === pending.value) {
      input.setSelectionRange(pending.position, pending.position);
    }
  });
  const parsed = parseMoneyText(value);
  const helper = parsed.status === "valid"
    ? formatKoreanWon(parsed.value ?? 0)
    : parsed.status === "invalid"
      ? "숫자와 쉼표만 입력할 수 있습니다."
      : parsed.status === "overflow"
        ? `${formatWon(MAX_SIMPLE_CALCULATOR_WON)} 이하로 입력해 주세요.`
        : hint ?? "빈 값은 모름입니다. 해당 없으면 0원을 입력하세요.";
  return (
    <label className={styles.field} data-input-label={label}>
      <span>{label}</span>
      <div className={styles.moneyInput}>
        <input
          ref={inputRef}
          name={name}
          aria-label={label}
          aria-describedby={`${name}-hint`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          aria-invalid={parsed.status === "invalid" || parsed.status === "overflow"}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            const selection = event.currentTarget.selectionStart ?? raw.length;
            const digitsBeforeCursor = raw.slice(0, selection).replace(/\D/g, "").length;
            const nextValue = formatMoneyText(raw);
            pendingSelection.current = /[^\d,\s]/.test(nextValue) ? null : {
              value: nextValue, position: cursorPositionForDigitCount(nextValue, digitsBeforeCursor),
            };
            onChange(name, nextValue);
          }}
        />
        <em>원</em>
      </div>
      <small id={`${name}-hint`} className={parsed.status === "invalid" || parsed.status === "overflow" ? styles.errorText : undefined}>{helper}</small>
    </label>
  );
}

function InputField({
  values,
  name,
  label,
  type = "text",
  inputMode,
  hint,
  onChange,
}: {
  values: FormValues;
  name: string;
  label: string;
  type?: string;
  inputMode?: "numeric";
  hint?: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <label className={styles.field} data-input-label={label}>
      <span>{label}</span>
      <input
        name={name}
        aria-label={label}
        type={type}
        inputMode={inputMode}
        value={text(values, name)}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function SelectField({
  values,
  name,
  label,
  options,
  onChange,
}: {
  values: FormValues;
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <label className={styles.field} data-input-label={label}>
      <span>{label}</span>
      <select name={name} aria-label={label} value={text(values, name)} onChange={(event) => onChange(name, event.target.value)}>
        <option value="">선택</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ConditionField({
  values,
  name,
  label,
  onChange,
}: {
  values: FormValues;
  name: string;
  label: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <fieldset className={styles.condition} data-input-label={label}>
      <legend>{label}</legend>
      <div>
        {conditionOptions.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={text(values, name) === option.value}
              onChange={() => onChange(name, option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CheckField({
  values,
  name,
  label,
  onChange,
}: {
  values: FormValues;
  name: string;
  label: string;
  onChange: (name: string, value: boolean) => void;
}) {
  return (
    <label className={styles.checkField}>
      <input type="checkbox" checked={values[name] === true} onChange={(event) => onChange(name, event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function InheritanceFields({ values, setValue }: { values: FormValues; setValue: (name: string, value: string | boolean) => void }) {
  const familyType = text(values, "familyType");
  const hasSpouse = familyType === "spouseChildren" || familyType === "spouseOnly";
  const showChildren = familyType === "spouseChildren" || familyType === "childrenOnly";
  const hasFinancialAssets = (parseMoneyText(text(values, "financialAssetsWon")).value ?? 0) > 0;
  return (
    <>
      <section className={styles.group}>
        <h2>기본정보</h2>
        <div className={styles.grid}>
          <InputField values={values} name="deathDate" label="상속개시일" type="date" onChange={setValue} />
          <SelectField values={values} name="familyType" label="지원 가족관계" onChange={setValue}
            options={[
              { value: "spouseChildren", label: "배우자와 자녀" },
              { value: "spouseOnly", label: "배우자만 법정상속인" },
              { value: "childrenOnly", label: "자녀만" },
              { value: "other", label: "그 밖의 가족관계" },
            ]} />
          {showChildren ? <InputField values={values} name="childrenCount" label="법정상속 대상 자녀 수" inputMode="numeric" onChange={setValue} /> : null}
          {hasSpouse ? <MoneyField values={values} name="spouseActualInheritanceWon" label="배우자가 실제로 상속받은 금액" onChange={setValue} /> : null}
        </div>
        <p className={styles.inlineHelp}>배우자 법정상속분은 배우자와 자녀만 있는 범위에서 자동 산출합니다. 배우자가 실제로 받은 금액은 직접 입력해야 합니다.</p>
      </section>
      <section className={styles.group}>
        <h2>재산·거래금액</h2>
        <div className={styles.grid}>
          <MoneyField values={values} name="realEstateWon" label="부동산가액" onChange={setValue} />
          <MoneyField values={values} name="financialAssetsWon" label="금융재산가액" onChange={setValue} />
          <MoneyField values={values} name="otherAssetsWon" label="기타재산가액" onChange={setValue} />
        </div>
        {hasFinancialAssets ? (
          <div className={styles.conditionGrid}>
            <ConditionField values={values} name="financialExclusionsStatus" label="금융재산 중 공제 제외 재산" onChange={setValue} />
            <p className={styles.inlineHelp}>위 금융재산에 포함한 최대주주 보유 주식·출자지분 등은 금융재산공제에서 제외됩니다. 금융기관 예금과 보유 현금은 구분해 주세요. 공제 대상 여부를 확인하지 못했다면 모름을 선택해 주세요.</p>
            {condition(values, "financialExclusionsStatus") === "yes" ? (
              <MoneyField values={values} name="financialExclusionsWon" label="금융재산 중 공제 제외 금액" hint="위 금융재산에 포함한 금액만 입력합니다. 상속재산에서 빼는 비과세 금액이 아닙니다." onChange={setValue} />
            ) : null}
          </div>
        ) : null}
      </section>
      <section className={styles.group}>
        <h2>추가 조건</h2>
        <div className={styles.conditionGrid}>
          <ConditionField values={values} name="deemedAssetsStatus" label="퇴직금·보험금·신탁재산 등" onChange={setValue} />
          {condition(values, "deemedAssetsStatus") === "yes" ? <MoneyField values={values} name="deemedAssetsWon" label="해당 재산가액" onChange={setValue} /> : null}
          <ConditionField values={values} name="nonTaxableStatus" label="비과세·과세가액 불산입액" onChange={setValue} />
          {condition(values, "nonTaxableStatus") === "yes" ? <MoneyField values={values} name="nonTaxableWon" label="불산입액" onChange={setValue} /> : null}
          <ConditionField values={values} name="debtStatus" label="채무" onChange={setValue} />
          {condition(values, "debtStatus") === "yes" ? <>
            <MoneyField values={values} name="debtWon" label="총채무 금액" onChange={setValue} />
            <MoneyField values={values} name="financialDebtWon" label="총채무 중 금융채무 금액" hint="금융채무가 없으면 0원. 총채무에 포함된 금액만 입력합니다." onChange={setValue} />
          </> : null}
          <ConditionField values={values} name="publicChargesStatus" label="공과금" onChange={setValue} />
          {condition(values, "publicChargesStatus") === "yes" ? <MoneyField values={values} name="publicChargesWon" label="공과금" onChange={setValue} /> : null}
          <ConditionField values={values} name="funeralStatus" label="일반 장례비용" onChange={setValue} />
          {condition(values, "funeralStatus") === "yes" ? <MoneyField values={values} name="funeralWon" label="일반 장례비용" onChange={setValue} /> : null}
          <ConditionField values={values} name="burialStatus" label="봉안시설·자연장지 비용" onChange={setValue} />
          {condition(values, "burialStatus") === "yes" ? <MoneyField values={values} name="burialWon" label="봉안시설·자연장지 비용" onChange={setValue} /> : null}
          <ConditionField values={values} name="seniorStatus" label="연로자 공제 대상" onChange={setValue} />
          {condition(values, "seniorStatus") === "yes" ? <InputField values={values} name="seniorCount" label="연로자 수" inputMode="numeric" onChange={setValue} /> : null}
          <ConditionField values={values} name="minorStatus" label="미성년자 공제 대상" onChange={setValue} />
          {condition(values, "minorStatus") === "yes" ? <InputField values={values} name="minorAges" label="미성년 상속인 만 나이" hint="예: 12, 16" onChange={setValue} /> : null}
          <ConditionField values={values} name="disabledStatus" label="장애인 공제 대상" onChange={setValue} />
          {condition(values, "disabledStatus") === "yes" ? <InputField values={values} name="disabledLifeYears" label="기대여명 합계(년)" inputMode="numeric" hint="통계청 생명표 기준 확인 필요" onChange={setValue} /> : null}
          <ConditionField values={values} name="priorGiftStatus" label="상속 전 사전증여" onChange={setValue} />
          {condition(values, "priorGiftStatus") === "yes" ? (
            <>
              <InputField values={values} name="priorGiftCount" label="사전증여 수증자 수" inputMode="numeric" hint="같은 사람은 한 번만 입력합니다. 배우자·자녀는 10년, 상속인 외 수증자는 5년 이내 합산 대상입니다." onChange={setValue} />
              <p className={styles.inlineHelp}>배우자·자녀의 일반 현금증여 신고 내역을 지원합니다. 피상속인에게 받은 합산 대상만 포함된 마지막 신고서의 과세표준·산출세액을 확인해 주세요. 납부 영수증 금액이나 신고세액공제 후 금액과는 다릅니다. 다른 증여자의 재산이 섞였거나 창업·가업승계 특례, 세대생략, 합산 대상이 달라진 내역은 미확인으로 표시해 주세요.</p>
              {Array.from({ length: Math.min(21, integer(values, "priorGiftCount") ?? 0) }, (_, index) => {
                const prefix = `priorGift${index}`;
                const label = `사전증여 ${index + 1}`;
                return <div className={styles.grid} key={prefix}>
                  <SelectField values={values} name={`${prefix}Recipient`} label={`${label} 수증자`} options={[{ value: "spouse", label: "배우자" }, { value: "child", label: "자녀" }, { value: "other", label: "그 밖의 수증자 (별도 검토)" }]} onChange={setValue} />
                  <SelectField values={values} name={`${prefix}Kind`} label={`${label} 재산 종류`} options={[{ value: "cash", label: "일반 현금 증여" }, { value: "other", label: "부동산·주식 등 (별도 검토)" }]} onChange={setValue} />
                  <MoneyField values={values} name={`${prefix}Amount`} label={`${label} 증여재산가액`} onChange={setValue} />
                  <MoneyField values={values} name={`${prefix}Base`} label={`${label} 신고 과세표준`} onChange={setValue} />
                  <MoneyField values={values} name={`${prefix}Tax`} label={`${label} 신고 산출세액`} onChange={setValue} />
                  <SelectField values={values} name={`${prefix}Eligible`} label={`${label} 공제요건 확인`} options={[{ value: "yes", label: "일반 신고·공제요건 확인" }, { value: "no", label: "제척기간 만료로 공제 제외" }, { value: "unknown", label: "미확인·과세특례" }]} onChange={setValue} />
                </div>;
              })}
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}

function GiftFields({ values, setValue }: { values: FormValues; setValue: (name: string, value: string | boolean) => void }) {
  return (
    <>
      <section className={styles.group}>
        <h2>기본정보</h2>
        <div className={styles.grid}>
          <InputField values={values} name="giftDate" label="증여일" type="date" onChange={setValue} />
          <SelectField values={values} name="resident" label="수증자 거주자 여부" onChange={setValue}
            options={[{ value: "yes", label: "거주자" }, { value: "no", label: "비거주자" }]} />
          <SelectField values={values} name="relationship" label="증여자와의 관계" onChange={setValue}
            options={[
              { value: "spouse", label: "배우자" },
              { value: "linealAscendantAdult", label: "직계존속 → 성년" },
              { value: "linealAscendantMinor", label: "직계존속 → 미성년" },
              { value: "linealDescendant", label: "직계비속" },
              { value: "otherRelative", label: "기타 친족" },
              { value: "unrelated", label: "친족 외" },
            ]} />
          <MoneyField values={values} name="amountWon" label="증여재산가액" onChange={setValue} />
        </div>
      </section>
      <section className={styles.group}>
        <h2>추가 조건</h2>
        <div className={styles.conditionGrid}>
          <ConditionField values={values} name="debtStatus" label="수증자 인수 채무" onChange={setValue} />
          {condition(values, "debtStatus") === "yes" ? <MoneyField values={values} name="debtAssumedWon" label="인수 채무" onChange={setValue} /> : null}
          <ConditionField values={values} name="priorGiftStatus" label="최근 10년 동일인 관련 증여" onChange={setValue} />
          {condition(values, "priorGiftStatus") === "yes" ? (
            <>
              <MoneyField values={values} name="priorGiftWon" label="최근 10년 증여재산가액" onChange={setValue} />
              <MoneyField values={values} name="priorGiftDeductionWon" label="같은 증여자의 과거 증여에 적용한 공제" hint="위 과거 증여에서 실제 적용한 일반 증여재산공제. 직계존속은 그 배우자 포함." onChange={setValue} />
              <ConditionField values={values} name="previousTaxKnown" label="종전 증여 산출세액 확인" onChange={setValue} />
              {condition(values, "previousTaxKnown") === "yes" ? <MoneyField values={values} name="previousTaxPaidWon" label="종전 증여 산출세액" onChange={setValue} /> : null}
            </>
          ) : null}
          <ConditionField values={values} name="otherGiftDeductionStatus" label="그 밖의 증여에서 사용한 같은 구분의 공제" onChange={setValue} />
          {condition(values, "otherGiftDeductionStatus") === "yes" ? <MoneyField values={values} name="otherGiftDeductionWon" label="그 밖의 증여에서 사용한 같은 구분의 공제" hint="최근 10년 같은 관계 구분의 공제. 위 동일인 관련 과거 공제는 제외합니다." onChange={setValue} /> : null}
          <ConditionField values={values} name="appraisalStatus" label="감정평가수수료" onChange={setValue} />
          {condition(values, "appraisalStatus") === "yes" ? <MoneyField values={values} name="appraisalFeeWon" label="감정평가수수료" onChange={setValue} /> : null}
          <ConditionField values={values} name="marriageBirthStatus" label="혼인·출산 증여재산공제 요건 충족" onChange={setValue} />
          {condition(values, "marriageBirthStatus") === "yes" ? <>
            <SelectField values={values} name="marriageBirthEvent" label="혼인·출산 구분" options={[{ value: "marriage", label: "혼인" }, { value: "birth", label: "출산·입양" }]} onChange={setValue} />
            <InputField values={values} name="marriageBirthEventDate" label="혼인·출산 기준일" type="date" hint="혼인신고일(예정일 포함), 출생일 또는 입양신고일" onChange={setValue} />
            <ConditionField values={values} name="marriageBirthUsedStatus" label="이미 사용한 혼인·출산 공제" onChange={setValue} />
            {condition(values, "marriageBirthUsedStatus") === "yes" ? <MoneyField values={values} name="marriageBirthPreviouslyUsedWon" label="이미 사용한 혼인·출산 공제 금액" hint="부모·조부모 등 모든 직계존속의 혼인·출산 공제를 합한 평생 사용액" onChange={setValue} /> : null}
          </> : null}
          <ConditionField values={values} name="generationSkipStatus" label="세대생략 할증 대상" onChange={setValue} />
          {condition(values, "generationSkipStatus") === "yes" ? <CheckField values={values} name="minorOverTwoBillion" label="미성년 수증자에게 20억원 초과 증여" onChange={setValue} /> : null}
        </div>
      </section>
    </>
  );
}

function CapitalGainsFields({ values, setValue }: { values: FormValues; setValue: (name: string, value: string | boolean) => void }) {
  const assetType = text(values, "assetType");
  const heldYears = fullYearsBetween(text(values, "acquisitionDate"), text(values, "transferDate"));
  return (
    <>
      <section className={styles.group}>
        <h2>기본정보</h2>
        <div className={styles.grid}>
          <InputField values={values} name="acquisitionDate" label="취득일" type="date" onChange={setValue} />
          <InputField values={values} name="transferDate" label="양도일" type="date" onChange={setValue} />
          <SelectField values={values} name="resident" label="양도자 거주자 여부" onChange={setValue} options={[{ value: "yes", label: "거주자" }, { value: "no", label: "비거주자" }]} />
          <SelectField values={values} name="assetType" label="자산 종류" onChange={setValue}
            options={[
              { value: "generalBuilding", label: "일반 건물" },
              { value: "land", label: "일반 토지" },
              { value: "oneHome", label: "주택 (비과세 요건 별도 확인)" },
              { value: "otherUnsupported", label: "분양권·입주권 등" },
            ]} />
          {heldYears !== null ? <p className={styles.derivedBox}>보유기간은 만 {heldYears}년으로 계산됩니다.</p> : null}
        </div>
      </section>
      <section className={styles.group}>
        <h2>재산·거래금액</h2>
        <div className={styles.grid}>
          <MoneyField values={values} name="salePriceWon" label="양도가액" onChange={setValue} />
          <MoneyField values={values} name="purchasePriceWon" label="취득가액" onChange={setValue} />
        </div>
      </section>
      <section className={styles.group}>
        <h2>추가 조건</h2>
        <div className={styles.conditionGrid}>
          <ConditionField values={values} name="expenseStatus" label="필요경비" onChange={setValue} />
          {condition(values, "expenseStatus") === "yes" ? <MoneyField values={values} name="necessaryExpenseWon" label="필요경비" hint="취득세·자본적 지출·양도비 등" onChange={setValue} /> : null}
          <ConditionField values={values} name="otherGainStatus" label="같은 해 다른 양도소득금액" onChange={setValue} />
          {condition(values, "otherGainStatus") === "yes" ? <>
            <SelectField values={values} name="otherGainDirection" label="다른 양도소득의 구분" options={[{ value: "profit", label: "소득" }, { value: "loss", label: "손실" }]} onChange={setValue} />
            <MoneyField values={values} name="otherCapitalGainWon" label="다른 양도소득금액" hint="같은 해 다른 거래 전체의 장기보유특별공제 후·기본공제 전 소득. 손실도 금액은 양수로 입력합니다." onChange={setValue} />
            <SelectField values={values} name="otherGainsGeneralRate" label="다른 양도 거래의 일반세율 확인" options={[{ value: "yes", label: "국내 토지·건물, 일반세율 과세만 있음" }, { value: "no", label: "단기·중과·감면·주식·국외자산 등이 있음" }, { value: "unknown", label: "모름" }]} onChange={setValue} />
            <ConditionField values={values} name="previousCapitalTaxStatus" label="같은 해 양도세 납부 이력" onChange={setValue} />
            {condition(values, "previousCapitalTaxStatus") === "yes" ? <>
              <MoneyField values={values} name="previousNationalTaxWon" label="같은 해 이미 납부한 양도소득세" hint="합산한 거래에 대한 국세만 입력합니다. 가산세는 제외합니다." onChange={setValue} />
              <MoneyField values={values} name="previousLocalTaxWon" label="같은 해 이미 납부한 지방소득세" hint="지방세 납부 내역을 별도로 확인합니다. 미납이면 0원입니다." onChange={setValue} />
            </> : null}
          </> : null}
          <ConditionField values={values} name="basicDeductionStatus" label="이미 사용한 양도소득 기본공제" onChange={setValue} />
          {condition(values, "basicDeductionStatus") === "yes" ? <MoneyField values={values} name="basicDeductionUsedWon" label="이미 사용한 기본공제" onChange={setValue} /> : null}
          {assetType === "oneHome" ? (
            <>
              <InputField values={values} name="homeCount" label="세대 기준 보유 주택 수" inputMode="numeric" onChange={setValue} />
              <SelectField values={values} name="homeOwnership" label="주택 소유·취득 형태" onChange={setValue} options={[{ value: "solePurchased", label: "매수한 단독명의 주택" }, { value: "other", label: "공동명의·상속·증여 취득 등" }]} />
              <ConditionField values={values} name="householdOtherRights" label="세대의 입주권·분양권" onChange={setValue} />
              <ConditionField values={values} name="residenceStatus" label="거주기간" onChange={setValue} />
              {condition(values, "residenceStatus") === "yes" ? <InputField values={values} name="residenceYears" label="거주 연수" inputMode="numeric" onChange={setValue} /> : null}
              <ConditionField values={values} name="regulatedAtAcquisition" label="취득 당시 조정대상지역" onChange={setValue} />
              <ConditionField values={values} name="homeSpecialConditions" label="주택의 별도 특례·제외 조건" onChange={setValue} />
              <p className={styles.derivedBox}>미등기·겸용주택·기준면적 초과 부수토지·상생임대 등 별도 특례가 있거나 확인하지 못했다면 표시해 주세요. 주택 수만으로 비과세가 확정되지 않습니다.</p>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}

function FormFields({ kind, values, setValue }: { kind: SimpleTaxKind; values: FormValues; setValue: (name: string, value: string | boolean) => void }) {
  if (kind === "inheritance") return <InheritanceFields values={values} setValue={setValue} />;
  if (kind === "gift") return <GiftFields values={values} setValue={setValue} />;
  return <CapitalGainsFields values={values} setValue={setValue} />;
}

function ResultPanel({
  result,
  stale,
  panelRef,
}: {
  result: SimpleCalculationResult | null;
  stale: boolean;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!result) {
    return (
      <aside className={styles.resultEmpty}>
        <Calculator aria-hidden="true" size={28} />
        <h2>입력 후 계산하기를 누르세요.</h2>
        <p>입력한 정보는 이 화면 안에서만 계산하며 외부로 자동 전송하지 않습니다.</p>
      </aside>
    );
  }
  const ready = result.status === "ready" && !stale;
  const financialDeduction = result.kind === "inheritance" ? result.lines.find((line) => line.label === "금융재산 상속공제") : undefined;
  const coreLines = result.lines.slice(Math.max(0, result.lines.length - (result.kind === "inheritance" ? 6 : 5)));
  return (
    <aside ref={panelRef} className={styles.result} aria-live="polite" tabIndex={-1}>
      <div className={styles.resultHeader}>
        <span className={ready ? styles.ready : styles.warn}>
          {ready ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {stale ? "다시 계산 필요" : ready ? "계산 완료" : "확인 필요"}
        </span>
        <p>기준 확인일 {result.checkedOn}</p>
      </div>
      <h2 tabIndex={-1} data-result-title>{result.title}</h2>
      {ready ? (
        <>
          <p className={styles.totalLabel}>{result.annualAggregation ? "추가 납부·환급 차액 (국세 + 지방소득세)" : result.kind === "capitalGains" ? "예상 납부세액 합계 (국세 + 지방소득세)" : "예상 납부세액"}</p>
          <strong className={styles.total}>{formatWon(result.totalTaxWon)}</strong>
          {result.annualAggregation ? <p className={styles.inlineHelp}>기납부세액을 뺀 차액입니다. 음수는 환급 예상액이며 실제 신고·심사에 따라 달라질 수 있습니다. 국세와 지방세는 각각 확인해 주세요.</p> : null}
        </>
      ) : (
        <div className={styles.blockedTotal}>
          <strong>{stale ? "입력이 바뀌었습니다." : "아직 세액을 계산하지 않았습니다."}</strong>
          <p>{stale ? "이전 결과를 현재 세액처럼 표시하지 않습니다. 다시 계산해 주세요." : "아래 항목을 확인하면 계산할 수 있습니다."}</p>
        </div>
      )}
      {!stale && result.missing.length ? <div className={styles.notice}><b>이번 계산을 막는 입력</b>{result.missing.map((item) => <p key={item}>{item}</p>)}</div> : null}
      {!stale && result.unsupported.length ? <div className={styles.notice}><b>이번 조건은 직접 계산 미지원</b>{result.unsupported.map((item) => <p key={item.label}>{item.label}: {item.reason}</p>)}</div> : null}
      {ready ? (
        <dl className={styles.summary}>
          <div><dt>과세표준</dt><dd>{formatWon(result.taxableBaseWon)}</dd></div>
          <div><dt>산출세액</dt><dd>{formatWon(result.grossTaxWon)}</dd></div>
          <div><dt>세액공제</dt><dd>{formatWon(result.creditWon)}</dd></div>
          <div><dt>{result.annualAggregation ? "차가감 양도소득세 (국세)" : result.kind === "capitalGains" ? "양도소득세 (국세)" : "국세"}</dt><dd>{formatWon(result.nationalTaxWon)}</dd></div>
          {result.kind === "capitalGains" ? <div><dt>{result.annualAggregation ? "차가감 지방소득세" : "지방소득세"}</dt><dd>{formatWon(result.localTaxWon)}</dd></div> : null}
        </dl>
      ) : null}
      {ready && financialDeduction && financialDeduction.amountWon < 0 ? (
        <p className={styles.inlineHelp} data-financial-deduction-note>금융재산공제 {formatWon(-financialDeduction.amountWon)}을 반영했습니다. 홈택스 간편계산과 비교할 때에는 금융재산공제 등 적용된 공제 항목도 함께 확인해 주세요.</p>
      ) : null}
      {ready ? (
        <section className={styles.lines}>
          <h3>핵심 계산내역</h3>
          {coreLines.map((line) => (
            <div key={`${line.label}-${line.amountWon}`}>
              <span>{line.label}{line.note ? <small>{line.note}</small> : null}</span>
              <strong>{formatWon(line.amountWon)}</strong>
            </div>
          ))}
        </section>
      ) : null}
      {ready && result.lines.length ? (
        <details className={styles.details}>
          <summary>상세 계산내역 보기</summary>
          <div className={styles.lines}>
            {result.lines.map((line) => (
              <div key={`${line.label}-${line.amountWon}-detail`}>
                <span>{line.label}{line.note ? <small>{line.note}</small> : null}</span>
                <strong>{formatWon(line.amountWon)}</strong>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <details className={styles.details}>
        <summary>계산 조건·근거 보기</summary>
        <div className={styles.assumptions}>
          {result.scopeNotes.map((item) => <p key={item.label}><b>{item.label}</b>: {item.reason}</p>)}
          {result.assumptions.map((item) => <p key={item}>{item}</p>)}
          {result.references.map((ref) => <a key={ref.url} href={ref.url} target="_blank" rel="noreferrer">{ref.label}</a>)}
        </div>
      </details>
    </aside>
  );
}

export function SimpleTaxCalculator() {
  const [kind, setKind] = useState<SimpleTaxKind>("inheritance");
  const [forms, setForms] = useState(blankForms);
  const [results, setResults] = useState<Partial<Record<SimpleTaxKind, SimpleCalculationResult>>>({});
  const [stale, setStale] = useState<Partial<Record<SimpleTaxKind, boolean>>>({});
  const [exampleLoaded, setExampleLoaded] = useState<Partial<Record<SimpleTaxKind, boolean>>>({});
  const resultRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLElement | null>(null);
  const pendingResultFocus = useRef<SimpleCalculationResult | null>(null);
  const activeValues = forms[kind];
  const currentTab = useMemo(() => tabs.find((tab) => tab.kind === kind)!, [kind]);

  const setValue = (name: string, value: string | boolean) => {
    setForms((current) => ({ ...current, [kind]: { ...current[kind], [name]: value } }));
    if (results[kind]) setStale((current) => ({ ...current, [kind]: true }));
  };

  const runCalculation = () => {
    const nextResult = calculate(kind, activeValues);
    pendingResultFocus.current = nextResult;
    setResults((current) => ({ ...current, [kind]: nextResult }));
    setStale((current) => ({ ...current, [kind]: false }));
  };

  // Focus only after React has committed the result and its input errors.
  useLayoutEffect(() => {
      const nextResult = pendingResultFocus.current;
      if (!nextResult || results[kind] !== nextResult) return;
      pendingResultFocus.current = null;
      if (nextResult.status === "ready") {
        const heading = resultRef.current?.querySelector<HTMLElement>("[data-result-title]");
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      const issue = nextResult.missing[0] ?? nextResult.unsupported[0]?.label ?? "";
      const aliases: Record<string, string> = {
        "가족관계": "familyType", "배우자·자녀 외 가족관계": "familyType", "취득일과 양도일": "acquisitionDate",
        "법정상속 대상 자녀 수": "childrenCount", "금융채무": "financialDebtWon", "채무": "debtWon",
        "미성년 상속인 나이": "minorAges", "장애인 기대여명 합계": "disabledLifeYears",
        "증여자와 수증자의 관계": "relationship", "종전 증여재산 산출세액": "previousTaxKnown",
        "사전증여재산": "priorGiftStatus", "주택 거주기간": "residenceStatus",
        "상속 전 사전증여": "priorGiftStatus",
        "이미 사용한 혼인·출산 공제": condition(activeValues, "marriageBirthUsedStatus") === "yes" ? "marriageBirthPreviouslyUsedWon" : "marriageBirthUsedStatus",
        "금융재산 중 공제 제외 재산": condition(activeValues, "financialExclusionsStatus") === "yes" ? "financialExclusionsWon" : "financialExclusionsStatus",
      };
      const alias = Object.entries(aliases).find(([label]) => issue.startsWith(label))?.[1];
      const fields = Array.from(formRef.current?.querySelectorAll<HTMLElement>("[data-input-label]") ?? []);
      const matching = fields.filter((field) => issue.startsWith(field.dataset.inputLabel ?? "__"))
        .sort((a, b) => (b.dataset.inputLabel?.length ?? 0) - (a.dataset.inputLabel?.length ?? 0))[0];
      const target = (alias ? formRef.current?.querySelector<HTMLElement>(`[name="${alias}"]`) : null)
        ?? matching?.querySelector<HTMLElement>("input,select") ?? resultRef.current;
      for (let parent = target?.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeValues, kind, results]);

  const reset = () => {
    setForms((current) => ({ ...current, [kind]: { ...blankForms[kind] } }));
    setResults((current) => ({ ...current, [kind]: undefined }));
    setStale((current) => ({ ...current, [kind]: false }));
    setExampleLoaded((current) => ({ ...current, [kind]: false }));
  };

  const loadExample = () => {
    setForms((current) => ({ ...current, [kind]: { ...exampleForms[kind] } }));
    setResults((current) => ({ ...current, [kind]: undefined }));
    setStale((current) => ({ ...current, [kind]: false }));
    setExampleLoaded((current) => ({ ...current, [kind]: true }));
  };

  return (
    <>
      <section className={styles.hero}>
        <p>자산승계 360 · 자체 참고 초안</p>
        <h1>간편 세금계산</h1>
        <span>날짜·가족관계·금액을 입력하면 같은 화면에서 예상 세액을 확인합니다. 확정 신고 전에는 전문가 검토가 필요합니다.</span>
      </section>
      <div className={styles.layout}>
        <section ref={formRef} className={styles.formPanel}>
          <div className={styles.tabs} role="tablist" aria-label="세목 선택">
            {tabs.map((tab) => (
              <button
                key={tab.kind}
                type="button"
                role="tab"
                aria-selected={kind === tab.kind}
                onClick={() => setKind(tab.kind)}
              >
                <strong>{tab.label}</strong>
                <span>{tab.caption}</span>
              </button>
            ))}
          </div>
          <div className={styles.formIntro}>
            <div>
              <h2>{currentTab.label} 입력</h2>
              <p>빈 값·모름·0원을 구분합니다. 없음으로 확인한 항목만 0원 또는 비적용 처리합니다.</p>
            </div>
            <button type="button" className={styles.exampleButton} onClick={loadExample}>
              <ClipboardList size={17} aria-hidden="true" /> 예시 불러오기
            </button>
          </div>
          {exampleLoaded[kind] ? <p className={styles.exampleNotice}><Info size={16} aria-hidden="true" /> 가상 예시가 입력되었습니다. 실제 상담·신고에는 고객 정보로 다시 확인해 주세요.</p> : null}
          <FormFields kind={kind} values={activeValues} setValue={setValue} />
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={runCalculation}>
              <Calculator size={18} aria-hidden="true" /> 계산하기
            </button>
            <button type="button" className={styles.secondary} onClick={reset}>
              <RotateCcw size={17} aria-hidden="true" /> 초기화
            </button>
          </div>
        </section>
        <ResultPanel result={results[kind] ?? null} stale={stale[kind] === true} panelRef={resultRef} />
      </div>
    </>
  );
}
