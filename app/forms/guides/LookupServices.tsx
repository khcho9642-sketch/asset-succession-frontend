import Link from "next/link";
import { ArrowRight, ChevronDown, ExternalLink, Search } from "lucide-react";
import { LOOKUP_SERVICES, type LookupService } from "@/lib/forms/lookup-services";
import { POST_DEATH_LOOKUP_SERVICES } from "@/lib/forms/post-death-lookup-services";
import type { GuideTiming } from "@/lib/forms/guides";
import styles from "./LookupServices.module.css";

const authenticationLabels = {
  self: "본인 인증",
  public: "공개 조회",
  certificate: "발급·열람 요건 확인",
  heir: "신청인 자격 확인",
} as const;

type PostDeathService = (typeof POST_DEATH_LOOKUP_SERVICES)[number];
const postDeathHeadings: Record<string, { title: string; description: string }> = {
  "first-actions": { title: "상속관계 확인에 필요한 증명서", description: "신청인과 고인의 관계를 확인할 자료부터 준비하세요." },
  "estate-inquiry": { title: "상속재산과 채무, 어디서 확인하나요?", description: "조회 범위와 신청 자격을 확인하고, 결과를 정리 노트에 기록하세요." },
  transfer: { title: "유족연금 신청, 어디서 확인하나요?", description: "해당 급여의 신청 자격과 준비 서류를 확인하세요." },
};

/** The provider handles authentication; this panel only explains what to check and record. */
export function LookupServices({ timing = "before-death", stepId }: { timing?: GuideTiming; stepId?: string }) {
  const isPostDeath = timing === "after-death";
  const services: readonly (LookupService | PostDeathService)[] = isPostDeath
    ? POST_DEATH_LOOKUP_SERVICES.filter(service => !stepId || service.stepId === stepId)
    : LOOKUP_SERVICES;
  if (!services.length) return null;
  const heading = isPostDeath
    ? postDeathHeadings[stepId ?? "estate-inquiry"] ?? postDeathHeadings["estate-inquiry"]
    : { title: "내 재산, 어디서 확인하나요?", description: "조회할 항목을 열고, 확인한 내용을 정리 노트에 기록하세요." };
  const headingId = isPostDeath ? `lookup-services-after-death-${stepId ?? "all"}-title` : "lookup-services-title";
  return <section className={styles.panel} aria-labelledby={headingId} data-lookup-timing={timing}>
    <div className={styles.heading}>
      <span className={styles.headingIcon}><Search size={20} aria-hidden="true" /></span>
      <div><h3 id={headingId}>{heading.title}</h3><p>{heading.description}</p></div>
    </div>
    {!isPostDeath && <div className={styles.intro}>
      <p>금융재산 조회는 재산 소유자 본인이 공식 사이트에서 인증해 진행하세요. 대리 조회가 필요하면 각 기관이 인정하는 자격과 절차를 확인하세요.</p>
      <p>조회사이트는 새 창으로 열립니다. 결과가 이 사이트로 자동 수집되지는 않으며, 인증정보·주민등록번호·계좌번호는 여기에 입력하지 마세요.</p>
    </div>}
    {isPostDeath && (!stepId || stepId === "estate-inquiry") && <div className={styles.intro}>
      <p>상속인·권리자 확인이 필요한 서비스는 신청인 자신의 인증과 필요한 증빙을 사용하세요. 고인의 계정으로 대신 로그인하지 마세요. 대리 신청은 기관별 자격과 절차를 확인하세요.</p>
      <p>공식 사이트는 새 창으로 열립니다. 조회 결과는 자동 수집되지 않으며, 인증정보·주민등록번호·계좌번호는 이곳에 입력하지 마세요.</p>
    </div>}
    <div className={styles.services}>{services.map(service => <div className={styles.anchor} id={`lookup-${service.id}`} key={service.id}>
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
            <a className={styles.providerLink} href={service.url} target="_blank" rel="noopener noreferrer">{isPostDeath ? "공식 사이트 열기" : "조회사이트 열기"} <span>새 창</span><ExternalLink size={15} aria-hidden="true" /></a>
          </div>
          {"application" in service ? <div className={styles.application}>
            <h4>신청 전에 확인하세요</h4>
            <dl>
              <dt>신청 자격</dt><dd>{service.application.eligibility}</dd>
              <dt>본인 인증</dt><dd>{service.authentication.text}</dd>
              <dt>준비 서류</dt><dd><ul>{service.application.documents.map(document => <li key={document}>{document}</li>)}</ul></dd>
              <dt>대리 신청</dt><dd>{service.application.representative}</dd>
              <dt>신청 방식</dt><dd>{service.application.channel}</dd>
            </dl>
          </div> : <p className={styles.authDetail}>{service.authentication.text}</p>}
          <div className={styles.checks}><h4>{isPostDeath ? "조회·신청 후 확인할 항목" : "조회 후 확인할 항목"}</h4><ul>{service.checks.map(check => <li key={check}>{check}</li>)}</ul></div>
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
