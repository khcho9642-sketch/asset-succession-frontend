import Link from "next/link";
import { MockNotice } from "@/components/MockNotice";
import { workspaceSteps } from "@/lib/mockData";

export default function ExpertOverviewPage() {
  return (
    <main className="page-shell">
      <MockNotice />
      <section className="panel wide">
        <p className="eyebrow">전문가 프로젝트 개요</p>
        <h1>공개 사전계산과 전문가 백오피스를 분리해 검토 흐름을 관리합니다.</h1>
        <div className="step-list">
          {workspaceSteps.map((step, index) => (
            <article key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{step}</p>
            </article>
          ))}
        </div>
        <Link className="button primary" href="/expert/workspace">작업공간 열기</Link>
      </section>
    </main>
  );
}
