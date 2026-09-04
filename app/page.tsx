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
          <h1 className="hero-title">
            <span>가족 자산승계 방향을</span>
            <span>먼저 비교하고,</span>
            <span>전문가는 근거를 검토합니다.</span>
          </h1>
          <p className="lead">
            <span>공개 화면은 개인정보 없이 비교하고,</span>
            <span>전문가 화면은 상담 전 검토 흐름을 정리합니다.</span>
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
