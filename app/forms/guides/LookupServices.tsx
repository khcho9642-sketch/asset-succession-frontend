import Link from "next/link";
import { ArrowRight, ChevronDown, ExternalLink, Search } from "lucide-react";
import { LOOKUP_SERVICES } from "@/lib/forms/lookup-services";
import styles from "./LookupServices.module.css";

const authenticationLabels = {
  self: "본인 인증",
  public: "공개 조회",
  certificate: "발급·열람 요건 확인",
} as const;

/** The provider handles authentication; this panel only explains what to check and record. */
export function LookupServices() {
  return <section className={styles.panel} aria-labelledby="lookup-services-title">
    <div className={styles.heading}>
      <span className={styles.headingIcon}><Search size={20} aria-hidden="true" /></span>
      <div><h3 id="lookup-services-title">내 재산, 어디서 확인하나요?</h3><p>조회할 항목을 열고, 확인한 내용을 정리 노트에 기록하세요.</p></div>
    </div>
    <div className={styles.intro}>
      <p>금융재산 조회는 재산 소유자 본인이 공식 사이트에서 인증해 진행하세요. 대리 조회가 필요하면 각 기관이 인정하는 자격과 절차를 확인하세요.</p>
      <p>조회사이트는 새 창으로 열립니다. 결과가 이 사이트로 자동 수집되지는 않으며, 인증정보·주민등록번호·계좌번호는 여기에 입력하지 마세요.</p>
    </div>
    <div className={styles.services}>{LOOKUP_SERVICES.map(service => <div className={styles.anchor} id={`lookup-${service.id}`} key={service.id}>
      <details className={styles.service}>
        <summary>
          <span className={styles.summaryCopy}><strong>{service.title}</strong><span>{service.provider}</span></span>
          <span className={styles.authentication} data-kind={service.authentication.kind}>{authenticationLabels[service.authentication.kind]}</span>
          <ChevronDown className={styles.chevron} size={17} aria-hidden="true" />
        </summary>
        <div className={styles.body}>
          <p className={styles.purpose}>{service.purpose}</p>
          <div className={styles.visit}>
            <div><p className={styles.miniLabel}>공식 사이트에서 찾을 메뉴</p><p className={styles.menu}>{service.menu}</p></div>
            <a className={styles.providerLink} href={service.url} target="_blank" rel="noopener noreferrer">조회사이트 열기 <span>새 창</span><ExternalLink size={15} aria-hidden="true" /></a>
          </div>
          <p className={styles.authDetail}>{service.authentication.text}</p>
          <div className={styles.checks}><h4>조회 후 확인할 항목</h4><ul>{service.checks.map(check => <li key={check}>{check}</li>)}</ul></div>
          <div className={styles.recording}><h4>정리 노트에는 이렇게 옮기세요</h4>{service.targets.map(target => <div className={styles.target} key={`${target.resourceId}-${target.questionId}`}>
            <p className={styles.record}>{target.record}</p>
            <p className={styles.example}><span>작성 예시</span>{target.example}</p>
            <Link className={styles.targetLink} href={`/forms/planning/${target.resourceId}#${target.questionId}`}><span>{target.label}<small>{target.resourceId === "PLAN-01" ? "가족·자산·채무 정리 노트" : "생활비·납부재원 점검표"}에 기록</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
          </div>)}</div>
          <p className={styles.limitation}>{service.limitation}</p>
        </div>
      </details>
    </div>)}</div>
  </section>;
}
