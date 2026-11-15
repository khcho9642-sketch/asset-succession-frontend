import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./FormsLibrary.module.css";

export function GuideEntrances() {
  return <section className={styles.situationEntrances} aria-labelledby="situation-heading">
    <h2 id="situation-heading">지금 어떤 상황이신가요?</h2>
    <p>해당하는 상황에서 필요한 일을 고르고, 준비할 서류를 확인하세요.</p>
    <div className={styles.situationGrid}>{[
      ["before-death", "상속을 미리 준비하고 있어요", "가족·재산 파악, 이전 방법, 생활비와 납부재원"],
      ["after-death", "상속이 발생했어요", "신고·기한 확인, 재산·채무 조회, 분할·이전·청구"],
      ["gift", "재산을 증여하려고 해요", "현금·부동산·주식별 계약과 이전·신고 자료"],
      ["transfer", "재산을 팔려고 해요", "거래 준비, 대금·비용 증빙, 신고 자료"],
      ["business-succession", "사업을 가족에게 넘기려고 해요", "가업상속, 주식 증여, 사업 이전과 사후관리"],
    ].map(([path, label, note]) => <Link key={path} href={`/forms/guides/${path}`}><span><strong>{label}</strong><small>{note}</small></span><ArrowRight size={19} aria-hidden="true" /></Link>)}</div>
  </section>;
}
