import { CalendarDays, CheckCircle2 } from "lucide-react";
import { PublicLightNav } from "@/components/PublicLightNav";

export default function ConsultationPage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <PublicLightNav />
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
        <aside className="border border-[var(--border)] bg-[var(--navy-950)] p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Consultation</p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.055em] md:text-5xl">
            사전진단 결과를 바탕으로 정밀 상담을 신청합니다.
          </h1>
          <p className="mt-5 text-base leading-8 text-white/66">
            가족이 입력한 사전진단 요약을 기준으로 쟁점을 먼저 확인하고, 필요한 자료와 상담 방향을 빠르게 정리합니다.
          </p>
          <div className="mt-8 border border-white/10 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Pre-check ID</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">AS360-DEMO-2409</p>
          </div>
        </aside>

        <section className="border border-[var(--border)] bg-white p-6 md:p-10">
          <div className="grid gap-6 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">상담 대표자</span>
              <input className="border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--gold)]" placeholder="예: 가족 대표" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold">전화번호</span>
              <input className="border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--gold)]" placeholder="연락 가능한 번호" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold">이메일 선택</span>
              <input className="border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--gold)]" placeholder="선택 입력" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold">연락 가능시간</span>
              <select className="border border-[var(--border)] bg-white px-4 py-3 outline-none focus:border-[var(--gold)]" defaultValue="weekday">
                <option value="weekday">평일 오전</option>
                <option>평일 오후</option>
                <option>저녁 시간</option>
              </select>
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-semibold">상담 희망내용</span>
              <textarea className="min-h-36 border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--gold)]" placeholder="예: 부모님 부동산 일부 증여와 상속세 납부재원 준비를 함께 보고 싶습니다." />
            </label>
          </div>
          <label className="mt-7 flex items-start gap-3 border border-[var(--border)] bg-[var(--ivory)] p-4">
            <input type="checkbox" className="mt-1" />
            <span className="text-sm leading-6 text-[var(--muted)]">개인정보 수집·이용에 동의합니다. 상담 일정 안내와 사전진단 결과 확인 목적으로만 사용됩니다.</span>
          </label>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <p className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
              <CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> 입력한 내용을 다시 작성할 필요가 없습니다.
            </p>
            <button type="button" className="inline-flex items-center gap-3 bg-[var(--navy-950)] px-6 py-4 text-sm font-semibold text-white">
              <CalendarDays className="h-4 w-4" /> 상담 신청하기
            </button>
          </div>
          <p className="mt-6 text-xs text-[var(--muted)]">합성 데이터 기반 화면입니다. 실제 저장·전송 기능은 연결되어 있지 않습니다.</p>
        </section>
      </section>
    </main>
  );
}
