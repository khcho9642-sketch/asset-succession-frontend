import { Check, FileCheck2, Gift, House, Landmark, Lightbulb, Search, UserRound, UsersRound } from "lucide-react";
import styles from "./HomePage.module.css";

// Desktop artwork and reflowed mobile text represent the same approved samples.
export const heroReports = [
  { image: "/media/hero-report-01.webp", title: "우리 가족 자산승계 진단서", description: "가족의 오늘이, 더 나은 내일로 이어지도록", seal: ["36개", "비교"] },
  { image: "/media/hero-report-02.webp", title: "맞춤 자산승계 전략 비교", description: "우리 가족에게 적합한 핵심 대안 3가지를 비교했습니다", seal: ["TOP", "3"] },
  { image: "/media/hero-report-03.webp", title: "자산승계 실행 로드맵", description: "분석에서 실행까지, 단계별로 준비합니다", seal: ["실행", "준비"] }
] as const;
const family = [
  { name: "장남", role: "사업 승계" }, { name: "장녀", role: "자산 분산" }, { name: "차남", role: "생활 안정" }
];
const assets = [["부동산", "60%"], ["금융자산", "25%"], ["사업자산", "10%"], ["기타자산", "5%"]];
const highlights = [
  { title: "분할 증여", body: "세 부담을 분산하고 가족 간 형평성을 높이는 전략", icon: House },
  { title: "가족 간 대여", body: "유동성을 확보하면서 세무 리스크를 줄이는 대안", icon: UsersRound },
  { title: "납부재원 확보", body: "상속세 납부를 위한 사전 재원 마련 전략", icon: FileCheck2 }
];
const strategies = [
  { title: "분할 증여", effect: "세 부담 분산", risk: "장기 계획 필요", fit: "매우 높음", icon: Gift },
  { title: "가족 간 대여", effect: "납부재원 확보", risk: "계약·이자 관리", fit: "높음", icon: UsersRound },
  { title: "상속 후 정산", effect: "실행 절차 단순", risk: "재산 분배 협의", fit: "보통", icon: FileCheck2 }
];
const roadmap = [
  { title: "가족·자산 확인", body: "가족관계와 보유자산 정리", icon: UsersRound },
  { title: "전략 비교", body: "36개 전략 후보 분석", icon: Search },
  { title: "전문가 검토", body: "세무 위험과 실행 가능성 확인", icon: UserRound },
  { title: "실행 계획", body: "일정과 준비서류 안내", icon: FileCheck2 }
];

export function HeroReportContent({ index }: { index: number }) {
  const report = heroReports[index];
  return (
    <div className={styles.reportContent}>
      <div className={styles.reportHeading}>
        <div><h2>{report.title}</h2><p>{report.description}</p></div>
        <span className={styles.seal} aria-hidden="true"><span>{report.seal[0]}</span><span>{report.seal[1]}</span></span>
      </div>
      {index === 0 ? <>
        <section className={styles.reportBox} aria-label="가족 및 자산 구조 요약">
          <h3>가족 및 자산 구조 요약</h3>
          <div className={styles.familyTree}>
            <div className={styles.parents}><UsersRound aria-hidden="true" size={23} /><span>부모 세대</span></div>
            <div className={styles.children}>
              {family.map((person) => <div className={styles.child} key={person.name}>
                <UserRound aria-hidden="true" size={23} /><p>{person.name} <span>({person.role})</span></p>
              </div>)}
            </div>
          </div>
          <div className={styles.assetSummary}><h4>주요 자산 현황</h4><dl>{assets.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></div>
        </section>
        <section className={styles.reportBox} aria-label="AI 추천 핵심 전략 TOP 3">
          <h3>AI 추천 핵심 전략 TOP 3</h3>
          <div className={styles.reportHighlights}>{highlights.map(({ title, body, icon: Icon }) => <div key={title}><Icon aria-hidden="true" size={22} /><div><h4>{title}</h4><p>{body}</p></div></div>)}</div>
        </section>
      </> : index === 1 ? <>
        <ol className={styles.strategyList}>
          {strategies.map(({ title, effect, risk, fit, icon: Icon }, i) => <li key={title}>
            <div className={styles.strategyTitle}><Icon aria-hidden="true" size={23} /><h3>{title}</h3><span>{i + 1}</span></div>
            <dl><div><dt>핵심 효과</dt><dd>{effect}</dd></div><div><dt>유의사항</dt><dd>{risk}</dd></div><div><dt>적합도</dt><dd>{fit}</dd></div></dl>
          </li>)}
        </ol>
        <aside className={styles.reportInsight}><Lightbulb aria-hidden="true" size={22} /><div><h3>AI 분석 결과</h3><p>분할 증여와 납부재원 마련을 함께 검토하는 방안이 가장 적합합니다</p></div></aside>
      </> : <>
        <ol className={styles.reportRoadmap}>
          {roadmap.map(({ title, body, icon: Icon }, i) => <li key={title}><span>{String(i + 1).padStart(2, "0")}</span><Icon aria-hidden="true" size={24} /><div><h3>{title}</h3><p>{body}</p></div></li>)}
        </ol>
        <section className={styles.reportBox} aria-label="전문가 검토"><h3>전문가 검토</h3><div className={styles.reportHighlights}>
          <div><UserRound aria-hidden="true" size={24} /><div><h4>세무전문가</h4><p>세금·신고 위험 검토</p></div></div>
          <div><Landmark aria-hidden="true" size={24} /><div><h4>회계사</h4><p>자산구조·재원 검토</p></div></div>
        </div></section>
        <aside className={styles.reportInsight}><Check aria-hidden="true" size={22} /><p>최종 실행 여부는 충분한 상담 후 결정합니다</p></aside>
      </>}
    </div>
  );
}
