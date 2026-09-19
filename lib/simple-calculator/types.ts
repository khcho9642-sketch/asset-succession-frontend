export type SimpleTaxKind = "inheritance" | "gift" | "capitalGains";

export type MoneyInput = number | null;

export type CalculationLine = {
  label: string;
  amountWon: number;
  note?: string;
};

export type UnsupportedItem = {
  label: string;
  reason: string;
};

export type SimpleCalculationResult = {
  kind: SimpleTaxKind;
  title: string;
  status: "ready" | "needs_info" | "unsupported";
  taxName: string;
  taxableBaseWon: number;
  grossTaxWon: number;
  creditWon: number;
  nationalTaxWon: number;
  localTaxWon: number;
  totalTaxWon: number;
  lines: CalculationLine[];
  missing: string[];
  assumptions: string[];
  unsupported: UnsupportedItem[];
  scopeNotes: UnsupportedItem[];
  references: Array<{ label: string; url: string }>;
  checkedOn: string;
  annualAggregation?: boolean;
};

export type InheritancePriorGift = {
  recipient: "spouse" | "child" | "other" | null;
  propertyKind: "cash" | "other" | null;
  amountWon: MoneyInput;
  taxableBaseWon: MoneyInput;
  calculatedTaxWon: MoneyInput;
  creditEligible: "yes" | "no" | "unknown" | null;
};

export type InheritanceInput = {
  deathDate: string;
  spouse: "yes" | "no";
  spouseSoleHeir: boolean;
  childrenCount: number | null;
  minorDeductionWon: MoneyInput;
  seniorCount: number | null;
  disabledDeductionWon: MoneyInput;
  realEstateWon: MoneyInput;
  financialAssetsWon: MoneyInput;
  financialExclusionsWon: MoneyInput;
  otherAssetsWon: MoneyInput;
  deemedAssetsWon: MoneyInput;
  nonTaxableWon: MoneyInput;
  priorGiftSpouseWon: MoneyInput;
  priorGiftHeirsWon: MoneyInput;
  priorGiftOthersWon: MoneyInput;
  debtWon: MoneyInput;
  financialDebtWon: MoneyInput;
  publicChargesWon: MoneyInput;
  funeralWon: MoneyInput;
  burialWon: MoneyInput;
  spouseActualInheritanceWon: MoneyInput;
  statutoryShareNumerator: number | null;
  statutoryShareDenominator: number | null;
  spousePriorGiftTaxableWon: MoneyInput;
  priorGifts: InheritancePriorGift[] | null;
};

export type GiftInput = {
  giftDate: string;
  resident: "yes" | "no";
  relationship: "spouse" | "linealAscendantAdult" | "linealAscendantMinor" | "linealDescendant" | "otherRelative" | "unrelated";
  amountWon: MoneyInput;
  debtAssumedWon: MoneyInput;
  priorGiftWon: MoneyInput;
  priorGiftDeductionWon: MoneyInput;
  otherGiftDeductionWon: MoneyInput;
  appraisalFeeWon: MoneyInput;
  marriageBirthDeductionWon: MoneyInput;
  marriageBirthPreviouslyUsedWon: MoneyInput;
  marriageBirthEvent: "marriage" | "birth" | null;
  marriageBirthEventDate: string | null;
  previousTaxPaidWon: MoneyInput;
  generationSkip: boolean;
  minorOverTwoBillion: boolean;
};

export type CapitalGainsInput = {
  transferDate: string;
  acquisitionDate: string;
  assetType: "generalBuilding" | "land" | "oneHome" | "otherUnsupported";
  salePriceWon: MoneyInput;
  purchasePriceWon: MoneyInput;
  necessaryExpenseWon: MoneyInput;
  otherCapitalGainWon: MoneyInput;
  basicDeductionUsedWon: MoneyInput;
  annualAggregation: boolean;
  otherGainsGeneralRate: "yes" | "no" | "unknown" | null;
  previousNationalTaxWon: MoneyInput;
  previousLocalTaxWon: MoneyInput;
  residenceYears: number | null;
  homeCount: number | null;
  regulatedArea: boolean;
  resident: "yes" | "no" | null;
  homeOwnership: "solePurchased" | "other" | null;
  householdOtherRights: "no" | "yes" | "unknown" | null;
  regulatedAtAcquisition: "no" | "yes" | "unknown" | null;
  homeSpecialConditions: "no" | "yes" | "unknown" | null;
};
