import Link from "next/link";
import { ArrowRight, Building2, Clock3, FileCheck2, Gift, House, Landmark, ShieldCheck } from "lucide-react";
import { HeroPaperCarousel } from "@/components/HeroPaperCarousel";
import { PublicNav } from "@/components/PublicNav";
import styles from "@/components/HomePage.module.css";

const services = [
  { title: "상속세", body: "가족의 재산 배분과 상속세 납부재원을 함께 살핍니다.", href: "/precheck?purpose=inheritance", icon: Landmark },
  { title: "증여", body: "누구에게, 언제, 얼마나 나눌지 가족의 상황부터 정리합니다.", href: "/precheck?purpose=gift", icon: Gift },
  { title: "부동산·양도", body: "보유와 양도, 증여 사이의 세금과 현금흐름을 비교합니다.", href: "/precheck?purpose=capital-gains", icon: House },
  { title: "가업승계", body: "사업의 연속성과 가족의 자산 배분을 함께 검토합니다.", href: "/precheck?purpose=business", icon: Building2 },
  { title: "세무조사 대응", body: "신고 전 확인할 쟁점과 준비자료를 전문가 상담으로 점검합니다.", href: "/consultation", icon: ShieldCheck }
];
const steps = [
  { title: "가족·자산 확인", body: "말하듯 대화하며 현재 상황을 정리합니다." },
  { title: "맞춤 전략 비교", body: "36개 후보 중 우리 가족에게 필요한 대안을 선별합니다." },
  { title: "전문가 검토", body: "세무전문가·회계사가 실행 조건과 위험을 확인합니다." },
  { title: "실행 계획", body: "가족의 우선순위에 맞춰 순서와 준비자료를 정합니다." }
];

export default function LandingPage() {
  return (
    <main className={styles.home}>
      <a className={styles.skipLink} href="#home-content">본문으로 건너뛰기</a>
      <PublicNav />
      <section id="home-content" className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>AI × 세무전문가 자산승계 진단</p>
            <h1 id="home-title" className={styles.heroTitle}>
              <span>막막한 자산승계,</span>
              <span>우리 가족의 3가지 전략부터.</span>
            </h1>
            <p className={styles.heroDescription}>
              <span>양도·상속·증여·가업승계까지,</span>
              <span>AI가 36개 전략 후보를 비교합니다.</span>
            </p>
            <div className={styles.heroActions}>
              <Link href="/precheck" className={styles.primaryButton}>무료 AI 진단 시작하기 <ArrowRight aria-hidden="true" size={20} /></Link>
              <Link href="/precheck/result?demo=1" className={styles.secondaryButton}>샘플 보고서 보기</Link>
            </div>
            <p className={styles.trustNote}><Clock3 aria-hidden="true" size={17} /> 회원가입 없이 · 약 5분 · 결과 즉시 확인</p>
          </div>
          <HeroPaperCarousel />
        </div>
      </section>
      <section className={styles.services} aria-labelledby="services-title">
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.sectionLabel}>가족의 상황에 맞는 전문 검토</p><h2 id="services-title">자산의 종류보다,<br />가족의 다음을 먼저 생각합니다.</h2></div>
            <p>세금 하나만 따로 보지 않습니다.<br />가족관계, 자산구조, 남겨둘 생활비까지 함께 살핍니다.</p>
          </div>
          <div className={styles.serviceGrid}>
            {services.map(({ title, body, href, icon: Icon }) => (
              <Link className={styles.serviceCard} key={title} href={href}>
                <Icon aria-hidden="true" size={26} strokeWidth={1.4} /><h3>{title}</h3><p>{body}</p>
                <span className={styles.cardLink}>{title === "세무조사 대응" ? "전문가 상담" : "진단으로 살펴보기"}<ArrowRight aria-hidden="true" size={16} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className={styles.process} aria-labelledby="process-title">
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.sectionLabel}>대화에서 실행까지</p><h2 id="process-title">복잡한 상속 문제,<br />먼저 구조부터 진단합니다.</h2></div>
            <p>고객 이익 최우선 · AI 기반 정밀 분석<br />전문가의 경험에 AI의 속도를 더했습니다.</p>
          </div>
          <ol className={styles.processGrid}>
            {steps.map((step, index) => <li key={step.title}><span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}
          </ol>
          <div className={styles.consultationPanel}>
            <FileCheck2 aria-hidden="true" size={32} strokeWidth={1.3} />
            <div><h3>우리 가족의 계획, 전문가와 구체화하세요.</h3><p>신속한 실행과 합리적인 비용. 최종 실행은 충분한 상담과 검토 후 결정합니다.</p></div>
            <Link href="/consultation" className={styles.consultationButton}>전문가 상담 신청 <ArrowRight aria-hidden="true" size={18} /></Link>
          </div>
        </div>
      </section>
      <footer className={styles.footer}><div className={styles.container}><span className={styles.footerBrand}>자산승계 360</span><p>오늘의 준비가 내일의 가족을 지킵니다.</p><small>사전진단은 상담을 위한 참고자료입니다. 실제 세액과 실행 가능성은 전문가 검토 후 확인합니다.</small></div></footer>
    </main>
  );
}
