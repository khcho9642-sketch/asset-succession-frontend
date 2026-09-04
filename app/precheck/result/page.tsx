import Link from "next/link";
import { MockNotice } from "@/components/MockNotice";
import { ScenarioTable } from "@/components/ScenarioTable";

export default function ResultPage() {
  return (
    <main className="page-shell">
      <MockNotice />
      <section className="section-heading">
        <p className="eyebrow">사전계산 결과 비교</p>
        <h1>세액 확정이 아니라 상담 전 의사결정용 비교입니다.</h1>
      </section>
      <div className="result-grid">
        <article className="panel">
          <span className="pill safe">추천 후보</span>
          <h2>일부 지분 증여</h2>
          <p>가족 간 소유 이전 효과는 명확하지만 평가방법과 취득세는 전문가 검토가 필요합니다.</p>
          <strong className="big-number">검토점수 82</strong>
        </article>
        <article className="panel">
          <span className="pill warn">주의</span>
          <h2>부담부증여</h2>
          <p>채무 인수 증빙이 갖춰지면 비교 가치가 있으나, 미입증 시 자동계산을 차단합니다.</p>
          <strong className="big-number">검토점수 68</strong>
        </article>
      </div>
      <ScenarioTable />
      <div className="actions">
        <Link className="button primary" href="/consultation">상담 신청으로 이동</Link>
      </div>
    </main>
  );
}
