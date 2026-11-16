"use client";

import Link from "next/link";
import { ArrowRight, Check, Mail, MessageCircle, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { PublicNav } from "@/components/PublicNav";
import { readAssessmentFromSession } from "@/lib/assessment";
import { KAKAO_OPEN_CHAT_URL } from "@/lib/contactLinks";
import homeStyles from "@/components/HomePage.module.css";
import styles from "./Consultation.module.css";

type Receipt = { id: string; notification: "sent" | "pending" };
type PendingRequest = { requestId: string; randomSalt: string; fingerprintHash: string; createdAt: number };
const PENDING_REQUEST_KEY = "as360.consultation.pending.v1";
const PENDING_REQUEST_TTL = 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readPendingRequest(): PendingRequest | null {
  try {
    const serialized = window.sessionStorage.getItem(PENDING_REQUEST_KEY);
    if (!serialized) return null;
    const value: unknown = JSON.parse(serialized);
    const now = Date.now();
    if (value && typeof value === "object" && Object.keys(value).length === 4
      && "requestId" in value && typeof value.requestId === "string" && UUID.test(value.requestId)
      && "randomSalt" in value && typeof value.randomSalt === "string" && UUID.test(value.randomSalt)
      && "fingerprintHash" in value && typeof value.fingerprintHash === "string" && /^[0-9a-f]{64}$/.test(value.fingerprintHash)
      && "createdAt" in value && typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
      && value.createdAt <= now && now - value.createdAt < PENDING_REQUEST_TTL) {
      return { requestId: value.requestId, randomSalt: value.randomSalt, fingerprintHash: value.fingerprintHash, createdAt: value.createdAt };
    }
    window.sessionStorage.removeItem(PENDING_REQUEST_KEY);
  } catch {
    // Blocked storage or malformed metadata must not block contact submission.
    try { window.sessionStorage.removeItem(PENDING_REQUEST_KEY); } catch { /* Storage is optional. */ }
  }
  return null;
}

async function rememberPendingRequest(phone: string, assessmentId: string, fallbackId: string): Promise<string> {
  try {
    const hash = async (salt: string) => {
      const bytes = new TextEncoder().encode(`${salt}\n${phone}\n${assessmentId}`);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    };
    const stored = readPendingRequest();
    if (stored && await hash(stored.randomSalt) === stored.fingerprintHash
      && Date.now() - stored.createdAt < PENDING_REQUEST_TTL) return stored.requestId;
    const randomSalt = crypto.randomUUID();
    const pending: PendingRequest = { requestId: fallbackId, randomSalt, fingerprintHash: await hash(randomSalt), createdAt: Date.now() };
    window.sessionStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify(pending));
  } catch {
    // Keep the in-memory retry ID when storage or Web Crypto is unavailable.
  }
  return fallbackId;
}

function clearPendingRequest() {
  try { window.sessionStorage.removeItem(PENDING_REQUEST_KEY); } catch { /* Storage is optional. */ }
}

export default function ConsultationPage() {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; consent?: string }>({});
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [assessmentId, setAssessmentId] = useState("");
  const [assessmentMismatch, setAssessmentMismatch] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const websiteRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  // Raw contact data stays in memory; only a salted pending-request hash is stored.
  const retryRequest = useRef<{ fingerprint: string; requestId: string } | null>(null);

  useEffect(() => {
    // Diagnosis is optional for contact-only enquiries. Never attach a mismatched snapshot.
    try {
      const result = readAssessmentFromSession();
      if (result.status === "ready") setAssessmentId(result.snapshot.assessment_id);
      else if (result.status === "mismatch") setAssessmentMismatch(true);
    } catch {
      // Contact information remains available when browser storage is unavailable.
    }
    readPendingRequest(); // Remove expired metadata without restoring input values.
    setReady(true);
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, []);

  useEffect(() => {
    if (receipt) confirmationRef.current?.focus();
  }, [receipt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || inFlight.current) return;
    const enteredPhone = phoneRef.current?.value ?? phone;
    const value = enteredPhone.trim();
    const digits = value.replace(/\D/g, "");
    const nextErrors = {
      phone: !value ? "전화번호를 입력해 주세요."
        : !/^\+?[0-9][0-9 ()-]*$/.test(value) || digits.length < 8 || digits.length > 15
          ? "연락 가능한 전화번호를 확인해 주세요." : undefined,
      consent: !consent ? "상담 연락처 전달에 동의해 주세요." : undefined
    };
    setErrors(nextErrors);
    if (nextErrors.phone) { phoneRef.current?.focus(); return; }
    if (nextErrors.consent) { consentRef.current?.focus(); return; }

    // Preserve autofilled DOM values too if their change event was not observed.
    setPhone(enteredPhone);
    const payload = {
      phone: `${value.startsWith("+") ? "+" : ""}${digits}`,
      consent: true as const,
      ...(assessmentId ? { assessmentId } : {}),
      website: websiteRef.current?.value || "",
    };
    const fingerprint = JSON.stringify(payload);
    const controller = new AbortController();
    inFlight.current = true;
    activeRequest.current = controller;
    setSubmitting(true);
    setSubmitError("");
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 55_000);
    try {
      if (retryRequest.current?.fingerprint !== fingerprint) {
        retryRequest.current = { fingerprint, requestId: crypto.randomUUID() };
      }
      const requestId = await rememberPendingRequest(payload.phone, assessmentId, retryRequest.current.requestId);
      retryRequest.current = { fingerprint, requestId };
      if (activeRequest.current !== controller) return;
      if (controller.signal.aborted) throw new Error("Consultation request timed out");
      const response = await fetch("/api/consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
        body: JSON.stringify({ ...payload, requestId }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object"
        || !("ok" in result) || result.ok !== true
        || !("receiptId" in result) || result.receiptId !== requestId
        || !("notification" in result) || (result.notification !== "sent" && result.notification !== "pending")) {
        throw new Error("Consultation receipt was not confirmed");
      }
      if (activeRequest.current !== controller) return;
      clearPendingRequest();
      setReceipt({ id: requestId, notification: result.notification });
      setPhone("");
      setConsent(false);
      retryRequest.current = null;
    } catch {
      if (activeRequest.current !== controller) return;
      setSubmitError(timedOut
        ? "응답이 늦어 접수 여부를 확인하지 못했습니다. 입력한 내용은 남아 있습니다. 같은 내용으로 다시 접수를 확인해 주세요."
        : "접수 확인을 완료하지 못했습니다. 입력한 내용은 남아 있습니다. 잠시 후 다시 확인하거나 위의 직접 문의를 이용해 주세요.");
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        inFlight.current = false;
        setSubmitting(false);
      }
    }
  }

  return (
    <main className={`${homeStyles.paperTheme} ${styles.page}`}>
      <PublicNav />
      <section className={styles.content} aria-labelledby="contact-title">
        <header className={styles.intro}>
          <p className={styles.eyebrow}>자산승계 상담</p>
          <h1 id="contact-title">연락처만 남겨주세요.</h1>
          <p>자세한 이야기는 상담할 때 나누면 됩니다.</p>
        </header>

        <div className={styles.card}>
          <section className={styles.professional} aria-labelledby="professional-name">
            <p className={styles.sectionLabel}>직접 문의</p>
            <h2 id="professional-name">조경호 <span>회계사</span></h2>
            <address className={styles.contacts}>
              <a href={KAKAO_OPEN_CHAT_URL} target="_blank" rel="noopener noreferrer"
                aria-label="카카오톡 상담 (새 창)">
                <MessageCircle size={19} aria-hidden="true" /><span>카카오톡 상담</span>
              </a>
              <a href="tel:01089309642" className={styles.phoneLink}>
                <Phone size={19} aria-hidden="true" /><span>010-8930-9642</span>
              </a>
              <a href="mailto:khcho@hangilac.co.kr">
                <Mail size={19} aria-hidden="true" /><span>khcho@hangilac.co.kr</span>
              </a>
            </address>
            <p className={styles.contactHint}>카카오톡, 전화 또는 이메일로 바로 문의하셔도 됩니다.</p>
          </section>

          <section className={styles.formPanel} aria-label="연락처 남기기" data-assessment-id={assessmentId || undefined}>
            {receipt ? (
              <div className={styles.confirmation} role="status" data-consultation-state="success" data-receipt-id={receipt.id} data-notification={receipt.notification}>
                <Check size={26} aria-hidden="true" />
                <h2 ref={confirmationRef} tabIndex={-1}>상담 신청이 접수되었습니다.</h2>
                <p>{receipt.notification === "sent"
                  ? "연락처가 접수대장에 저장되었고 담당자에게 이메일 알림을 보냈습니다. 담당자가 확인 후 연락드립니다."
                  : "연락처는 접수대장에 저장되었습니다. 담당자 이메일 알림이 지연되고 있지만 접수는 완료되어 다시 신청하지 않으셔도 됩니다."}</p>
                <dl className={styles.receipt}><dt>접수번호</dt><dd>{receipt.id}</dd></dl>
                {receipt.notification === "pending" ? <p>빠른 확인이 필요하면 위의 직접 문의로 접수번호를 알려주세요.</p> : null}
                <button type="button" className={styles.secondaryButton} onClick={() => { setReceipt(null); setErrors({}); setSubmitError(""); }}>새로운 상담 신청</button>
              </div>
            ) : (
              <form action="/api/consultation" method="post" onSubmit={submit} noValidate autoComplete="off" aria-label="상담 연락처 접수" aria-busy={submitting}>
                <p className={styles.formNote} id="contact-form-note">남겨주신 전화번호를 상담 담당자에게 전달합니다.</p>
                <label className={styles.phoneLabel} htmlFor="contact-phone">전화번호</label>
                <input id="contact-phone" ref={phoneRef} name="phone" type="tel" inputMode="tel" autoComplete="off"
                  maxLength={25} required placeholder="연락 가능한 전화번호" value={phone} disabled={submitting}
                  aria-invalid={Boolean(errors.phone)} aria-describedby={"contact-form-note" + (errors.phone ? " contact-phone-error" : "")}
                  onChange={(event) => { setPhone(event.target.value); setSubmitError(""); setErrors((previous) => ({ ...previous, phone: undefined })); }} />
                <label className={styles.consent}>
                  <input ref={consentRef} name="consent" type="checkbox" required checked={consent} disabled={submitting}
                    aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "contact-consent-error" : undefined}
                    onChange={(event) => { setConsent(event.target.checked); setSubmitError(""); setErrors((previous) => ({ ...previous, consent: undefined })); }} />
                  <span>상담 연락을 위해 전화번호를 접수대장에 저장하고 조경호 회계사에게 전달하는 데 동의합니다.</span>
                </label>
                <div className={styles.honeypot} aria-hidden="true"><label>Website<input ref={websiteRef} type="text" name="website" autoComplete="off" tabIndex={-1} disabled={submitting} /></label></div>
                {errors.phone || errors.consent ? <div className={styles.errors} role="alert">
                  {errors.phone ? <p id="contact-phone-error">{errors.phone}</p> : null}
                  {errors.consent ? <p id="contact-consent-error">{errors.consent}</p> : null}
                </div> : null}
                {submitError ? <p className={styles.errors} role="alert" data-consultation-state="error">{submitError}</p> : null}
                {submitting ? <p className={styles.formNote} role="status" data-consultation-state="submitting">접수 중에는 이 화면에서 기다려 주세요.</p> : null}
                <button className={styles.submit} type="submit" disabled={!ready || submitting}>{submitting ? "접수 중…" : submitError ? "다시 접수 확인하기" : "상담 신청하기"} <ArrowRight size={18} aria-hidden="true" /></button>
              </form>
            )}
            {assessmentId ? <p className={styles.assessmentNote}>이 브라우저의 사전진단 번호를 상담 참고용으로 함께 남깁니다. 보고서 내용은 전송되지 않습니다. <Link href={"/precheck/result?assessment_id=" + encodeURIComponent(assessmentId)}>결과 보기</Link></p> : null}
            {assessmentMismatch ? <p className={styles.assessmentNote} role="status">진단 ID가 달라 결과는 연결하지 않았습니다. 연락처만 입력할 수 있습니다.</p> : null}
          </section>
        </div>
      </section>
    </main>
  );
}
