"use client";

import Link from "next/link";
import { CalendarDays, CheckCircle2, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AssessmentSummary } from "@/components/AssessmentSummary";
import { PublicLightNav } from "@/components/PublicLightNav";
import { readAssessmentFromSession } from "@/lib/assessment";
import type { AssessmentSnapshot } from "@/lib/assessment";

type FormState = {
  representative: string;
  phone: string;
  email: string;
  availableTime: string;
  message: string;
  consent: boolean;
};

const initialForm: FormState = {
  representative: "",
  phone: "",
  email: "",
  availableTime: "평일 오전",
  message: "",
  consent: false
};

function createReceiptId() {
  return `RCV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export default function ConsultationPage() {
  const [snapshot, setSnapshot] = useState<AssessmentSnapshot | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [receiptId, setReceiptId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [assessmentProblem, setAssessmentProblem] = useState("");
  const representativeRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const result = readAssessmentFromSession();
    if (result.status === "ready") {
      setSnapshot(result.snapshot);
      setAssessmentProblem("");
      return;
    }
    if (result.status === "mismatch") {
      setSnapshot(null);
      setAssessmentProblem("URL의 사전진단 ID와 이 브라우저의 저장값이 달라 상담 신청을 잠갔습니다.");
      return;
    }
    setSnapshot(null);
    setAssessmentProblem("상담 신청 전에 무료 사전진단을 먼저 완료해 주세요.");
  }, []);

  const assessmentId = snapshot?.assessment_id ?? "연결된 사전진단 없음";
  const canSubmit = Boolean(snapshot) && !submitted;

  const nextSteps = useMemo(
    () => [
      "접수 내용과 사전진단 요약을 기준으로 상담 쟁점을 정리합니다.",
      "채무·과거 증여·보험계약 등 추가 확인자료 목록을 안내합니다.",
      "확정 세액 산정 전 가족 회의용 비교 방향을 먼저 잡습니다."
    ],
    []
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setErrors([]);
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function submit() {
    if (!canSubmit) return;

    const phonePattern = /^[0-9+\-\s()]{8,20}$/;
    const nextErrors = [
      !form.representative.trim() ? "상담 대표자를 입력해 주세요." : "",
      !form.phone.trim() ? "전화번호를 입력해 주세요." : "",
      form.phone.trim() && !phonePattern.test(form.phone.trim()) ? "전화번호 형식을 확인해 주세요." : "",
      form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? "이메일 형식을 확인해 주세요." : "",
      !form.message.trim() ? "상담 희망내용을 입력해 주세요." : "",
      !form.consent ? "개인정보 수집·이용 동의가 필요합니다." : ""
    ].filter(Boolean);

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      if (!form.representative.trim()) representativeRef.current?.focus();
      else if (!form.phone.trim() || !phonePattern.test(form.phone.trim())) phoneRef.current?.focus();
      else if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) emailRef.current?.focus();
      else if (!form.message.trim()) messageRef.current?.focus();
      else if (!form.consent) consentRef.current?.focus();
      return;
    }

    setReceiptId(createReceiptId());
    setSubmitted(true);
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <PublicLightNav />
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
        <aside className="border border-[var(--border)] bg-[var(--navy-950)] p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Consultation</p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.055em] md:text-5xl">
            {snapshot ? "사전진단 결과를 바탕으로 정밀 상담을 신청합니다." : "사전진단 완료 후 정밀 상담을 신청합니다."}
          </h1>
          <p className="mt-5 text-base leading-8 text-white/66">
            {snapshot
              ? "가족이 입력한 사전진단 요약을 기준으로 쟁점을 먼저 확인하고, 필요한 자료와 상담 방향을 빠르게 정리합니다."
              : "먼저 가족 구성과 자산 범위를 간단히 선택하면, 상담 신청 단계에서 같은 내용을 다시 작성하지 않아도 됩니다."}
          </p>
          <div className="mt-8 border border-white/10 p-5">
            <p className="text-xs tracking-[0.08em] text-white/45">사전진단 ID</p>
            <p className="mt-3 break-all text-2xl font-semibold tracking-[-0.04em]">{assessmentId}</p>
          </div>
        </aside>

        <section className="grid gap-6">
          <AssessmentSummary compact />

          {!snapshot ? (
            <section className="border border-[var(--border)] bg-white p-6 md:p-10" role="status" aria-live="polite">
              <LockKeyhole className="h-7 w-7 text-[var(--gold)]" />
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">상담 신청 전 사전진단이 필요합니다.</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                {assessmentProblem} 입력 요약 없이 상담을 접수하면 가족·자산 정보를 다시 받아야 하므로, 이 프로토타입에서는 진단 완료 후 신청하도록 잠갔습니다.
              </p>
              <Link href="/precheck" className="mt-6 inline-flex bg-[var(--navy-950)] px-6 py-4 text-sm font-semibold text-white">
                무료 사전진단 시작하기
              </Link>
            </section>
          ) : submitted ? (
            <section className="border border-[var(--border)] bg-white p-6 md:p-10" role="status" aria-live="polite">
              <CheckCircle2 className="h-7 w-7 text-[var(--success)]" />
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[var(--navy-950)]">상담 신청이 접수되었습니다.</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <article className="border border-[var(--border)] bg-[var(--ivory)] p-5">
                  <p className="text-sm text-[var(--muted)]">접수번호</p>
                  <strong className="mt-3 block text-2xl tracking-[-0.04em]">{receiptId}</strong>
                </article>
                <article className="border border-[var(--border)] bg-[var(--ivory)] p-5">
                  <p className="text-sm text-[var(--muted)]">연결된 사전진단</p>
                  <strong className="mt-3 block break-all text-2xl tracking-[-0.04em]">{assessmentId}</strong>
                </article>
              </div>
              <ul className="mt-6 grid gap-3 text-sm leading-6 text-[var(--muted)]">
                {nextSteps.map((step) => (
                  <li key={step}>• {step}</li>
                ))}
              </ul>
              <p className="mt-6 text-xs text-[var(--muted)]">프로토타입 검증용 로컬 접수 상태이며 네트워크 전송은 발생하지 않았습니다.</p>
            </section>
          ) : (
            <section className="border border-[var(--border)] bg-white p-6 md:p-10">
              <div className="grid gap-6 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">상담 대표자</span>
                  <input ref={representativeRef} className="border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--gold)]" value={form.representative} onChange={(event) => updateField("representative", event.target.value)} placeholder="예: 가족 대표" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">전화번호</span>
                  <input ref={phoneRef} type="tel" inputMode="tel" className="border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--gold)]" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="연락 가능한 번호" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">이메일 선택</span>
                  <input ref={emailRef} type="email" className="border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--gold)]" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="선택 입력" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">연락 가능시간</span>
                  <select className="border border-[var(--border)] bg-white px-4 py-3 outline-none focus:border-[var(--gold)]" value={form.availableTime} onChange={(event) => updateField("availableTime", event.target.value)}>
                    <option>평일 오전</option>
                    <option>평일 오후</option>
                    <option>저녁 시간</option>
                  </select>
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold">상담 희망내용</span>
                  <textarea ref={messageRef} className="min-h-36 border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--gold)]" value={form.message} onChange={(event) => updateField("message", event.target.value)} placeholder="예: 부모님 부동산 일부 증여와 상속세 납부재원 준비를 함께 보고 싶습니다." />
                </label>
              </div>
              <label className="mt-7 flex items-start gap-3 border border-[var(--border)] bg-[var(--ivory)] p-4">
                <input ref={consentRef} type="checkbox" className="mt-1" checked={form.consent} onChange={(event) => updateField("consent", event.target.checked)} />
                <span className="text-sm leading-6 text-[var(--muted)]">개인정보 수집·이용에 동의합니다. 상담 일정 안내와 사전진단 결과 확인 목적으로만 사용됩니다.</span>
              </label>
              {errors.length > 0 ? (
                <div className="mt-5 border-l-2 border-[var(--warning)] bg-[#fff8ee] p-4 text-sm text-[var(--warning)]" role="alert" aria-live="assertive">
                  {errors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              ) : null}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                <p className="inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                  <CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> 입력한 내용을 다시 작성할 필요가 없습니다.
                </p>
                <button type="button" disabled={!canSubmit} onClick={submit} className="inline-flex items-center gap-3 bg-[var(--navy-950)] px-6 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">
                  <CalendarDays className="h-4 w-4" /> 상담 신청하기
                </button>
              </div>
              <p className="mt-6 text-xs text-[var(--muted)]">합성 데이터 기반 화면입니다. 제출 시 네트워크 전송 없이 이 화면 안에서 접수완료 상태만 표시합니다.</p>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
