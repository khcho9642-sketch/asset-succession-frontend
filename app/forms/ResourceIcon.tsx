import {
  ArrowRightLeft, BookOpen, BriefcaseBusiness, Building2, Calculator, CircleMinus,
  Coins, FileCheck2, FileText, FolderSearch, HandCoins, ReceiptText, Scale,
  ShieldCheck, Stamp, UsersRound, WalletCards, type LucideIcon,
} from "lucide-react";
import styles from "./ResourceIcon.module.css";

// Presentation only: these symbols never change the catalogue's use category or files.
const symbols: Record<string, { icon: LucideIcon; badge?: LucideIcon }> = {
  building: { icon: Building2, badge: FileText },
  transaction: { icon: FileCheck2 },
  balance: { icon: BookOpen, badge: Coins },
  debt: { icon: FileText, badge: CircleMinus },
  transfer: { icon: ReceiptText, badge: ArrowRightLeft },
  family: { icon: UsersRound, badge: FileText },
  tax: { icon: Calculator, badge: FileText },
  accounts: { icon: WalletCards },
  insurance: { icon: ShieldCheck },
  pension: { icon: HandCoins },
  identity: { icon: Stamp },
  estate: { icon: FolderSearch },
  legal: { icon: Scale },
  business: { icon: BriefcaseBusiness },
  guide: { icon: BookOpen },
};

export function resourceIconKind(title: string) {
  if (/금융거래확인서/.test(title)) return "transaction";
  if (/예금잔액|잔액증명/.test(title)) return "balance";
  if (/부채|채무|대출|보증|소비대차/.test(title)) return "debt";
  if (/이체|송금|계좌 이전|명의개서/.test(title)) return "transfer";
  if (/가족관계|기본증명|제적등본|친생|후견/.test(title)) return "family";
  if (/건축물|등기|토지|임야|부동산|공시지가|주택가격/.test(title)) return "building";
  if (/세금|세무|증여세|상속세|양도소득세|신고.*납부|분납|과세|평가정보|결정정보|증여추정/.test(title)) return "tax";
  if (/보험/.test(title)) return "insurance";
  if (/연금|퇴직|공제금|급여/.test(title)) return "pension";
  if (/인감|서명|확정일자/.test(title)) return "identity";
  if (/금융|예금|은행|계좌|주식|배당/.test(title)) return "accounts";
  if (/재산조회|사망자/.test(title)) return "estate";
  if (/유언|공정증서|청산|분할|계약/.test(title)) return "legal";
  if (/사업/.test(title)) return "business";
  return "guide";
}

export function ResourceIcon({ title }: { title: string }) {
  const kind = resourceIconKind(title);
  const { icon: Icon, badge: Badge } = symbols[kind];
  return <span className={styles.symbol} data-resource-icon={kind} aria-hidden="true">
    <Icon size={36} strokeWidth={1.8} />
    {Badge && <Badge className={styles.badge} size={21} strokeWidth={1.8} />}
  </span>;
}
