import { MockNotice } from "@/components/MockNotice";
import { ScenarioTable } from "@/components/ScenarioTable";

const reviewCards = [
  { title: "세법 근거", status: "SME 검토 준비", detail: "조문·예규·심판례 연결 완료" },
  { title: "차단조건", status: "활성", detail: "비과세·중과·감면·취득세 특례는 수동검토" },
  { title: "리포트", status: "초안", detail: "가족 공유용 요약과 전문가 메모 분리" }
];

export default function ExpertWorkspacePage() {
  return (
    <main className="page-shell">
      <MockNotice />
      <section className="section-heading">
        <p className="eyebrow">전문가 시나리오 작업공간</p>
        <h1>mock 프로젝트의 쟁점, 근거, 비교 결과를 한 화면에서 봅니다.</h1>
      </section>
      <div className="result-grid">
        {reviewCards.map((card) => (
          <article className="panel" key={card.title}>
            <span className="pill warn">{card.status}</span>
            <h2>{card.title}</h2>
            <p>{card.detail}</p>
          </article>
        ))}
      </div>
      <ScenarioTable />
    </main>
  );
}
