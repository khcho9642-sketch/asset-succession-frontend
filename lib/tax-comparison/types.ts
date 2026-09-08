export type TaxTrack = "inheritance" | "gift" | "capital_gains" | "business_succession";

/** Monetary form values are decimal 억원 strings; an empty value is never zero. */
export type TaxComparisonInput = {
  version: 1;
  track: TaxTrack;
  values: Record<string, string>;
  confirmed: boolean;
  confirmedAt?: string;
};

export type TaxLine = { label: string; amountWon: number; note?: string };
export type TaxCase = {
  id: string;
  label: string;
  taxableWon: number;
  grossTaxWon: number;
  creditWon: number;
  nationalTaxWon: number;
  localTaxWon: number;
  totalTaxWon: number;
  lines: TaxLine[];
  assumptions: string[];
};
export type TaxReference = { label: string; url: string };
export type TaxComparison = {
  version: 1;
  track: TaxTrack;
  status: "ready" | "needs_info" | "unsupported";
  title: string;
  scope: string;
  lawCheckedOn: string;
  baseline: TaxCase | null;
  alternatives: TaxCase[];
  missing: string[];
  assumptions: string[];
  exclusions: string[];
  references: TaxReference[];
  availableCashWon: number | null;
};

export type TaxField = {
  key: string;
  label: string;
  type: "money" | "integer" | "select" | "date";
  hint?: string;
  options?: Array<{ value: string; label: string }>;
  optional?: boolean;
};
