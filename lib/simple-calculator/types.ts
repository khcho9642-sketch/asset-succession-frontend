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
  references: Array<{ label: string; url: string }>;
  checkedOn: string;
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
  otherAssetsWon: MoneyInput;
  deemedAssetsWon: MoneyInput;
  nonTaxableWon: MoneyInput;
  priorGiftSpouseWon: MoneyInput;
  priorGiftHeirsWon: MoneyInput;
  priorGiftOthersWon: MoneyInput;
  debtWon: MoneyInput;
  publicChargesWon: MoneyInput;
  funeralWon: MoneyInput;
  burialWon: MoneyInput;
  spouseActualInheritanceWon: MoneyInput;
  statutoryShareNumerator: number | null;
  statutoryShareDenominator: number | null;
  spousePriorGiftTaxableWon: MoneyInput;
};

export type GiftInput = {
  giftDate: string;
  resident: "yes" | "no";
  relationship: "spouse" | "linealAscendantAdult" | "linealAscendantMinor" | "linealDescendant" | "otherRelative" | "unrelated";
  amountWon: MoneyInput;
  debtAssumedWon: MoneyInput;
  priorGiftWon: MoneyInput;
  usedDeductionWon: MoneyInput;
  appraisalFeeWon: MoneyInput;
  marriageBirthDeductionWon: MoneyInput;
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
  residenceYears: number | null;
  homeCount: number | null;
  regulatedArea: boolean;
};
