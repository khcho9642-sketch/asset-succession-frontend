import Link from "next/link";
import { MockNotice } from "@/components/MockNotice";
import { ScenarioTable } from "@/components/ScenarioTable";
import { heroMetrics } from "@/lib/mockData";

export default function LandingPage() {
  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">상속·증여·양도 통합 비교</p>
          <h1>가족 자산승계 방향을 먼저 비교하고, 전문가는 근거를 검토합니다.</h1>
          <p className="lead">
            공개 화면에서는 개인정보 없이 사전 시나리오를 비교하고, 전문가 화면에서는 상담 전 검토 흐름을 정리합니다.
          </p>
          <div className="actions">
            <Link className="button primary" href="/precheck">무가입 사전계산 시작</Link>
            <Link className="button ghost" href="/expert/overview">전문가 화면 보기</Link>
          </div>
        </div>
        <div className="hero-card">
          {heroMetrics.map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.note}</p>
            </article>
          ))}
        </div>
      </section>
      <MockNotice />
      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">Preview</p>
          <h2>가족 공유용 비교 요약</h2>
        </div>
        <ScenarioTable />
      </section>
    </main>
  );
}
