"use client";

import Link from "next/link";
import { ArrowRight, Check, Mail, Phone } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { PublicLightNav } from "@/components/PublicLightNav";
import { readAssessmentFromSession } from "@/lib/assessment";
import { contactPhoneCaret, formatContactPhone } from "@/lib/contactPhone";
import styles from "./Consultation.module.css";

export default function ConsultationPage() {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; consent?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [assessmentId, setAssessmentId] = useState("");
  const [assessmentMismatch, setAssessmentMismatch] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const pendingPhoneCaret = useRef<number | null>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Diagnosis is optional for contact-only enquiries. Never attach a mismatched snapshot.
    try {
      const result = readAssessmentFromSession();
      if (result.status === "ready") setAssessmentId(result.snapshot.assessment_id);
      else if (result.status === "mismatch") setAssessmentMismatch(true);
    } catch {
      // Contact information remains available when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (submitted) confirmationRef.current?.focus();
  }, [submitted]);

  useLayoutEffect(() => {
    // Restore before the next input/paste event, not in a delayed animation frame.
    const caret = pendingPhoneCaret.current;
    pendingPhoneCaret.current = null;
    if (caret !== null && phoneRef.current === document.activeElement) phoneRef.current?.setSelectionRange(caret, caret);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = phone.trim();
    const digits = value.replace(/\D/g, "");
    const nextErrors = {
      phone: !value ? "전화번호를 입력해 주세요."
        : !/^\+?[0-9][0-9 ()-]*$/.test(value) || digits.length < 8 || digits.length > 15
          ? "연락 가능한 전화번호를 확인해 주세요." : undefined,
      consent: !consent ? "전화번호 이용에 동의해 주세요." : undefined
    };
    setErrors(nextErrors);
    if (nextErrors.phone) { phoneRef.current?.focus(); return; }
    if (nextErrors.consent) { consentRef.current?.focus(); return; }

    // Preview only: do not persist, transmit, log or fabricate a receipt for contact details.
    setPhone("");
    setConsent(false);
    setSubmitted(true);
  }

  return (
    <main className={styles.page}>
      <PublicLightNav />
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
              <a href="tel:01089309642" className={styles.phoneLink}>
                <Phone size={19} aria-hidden="true" /><span>010-8930-9642</span>
              </a>
              <a href="mailto:khcho@hangilac.co.kr">
                <Mail size={19} aria-hidden="true" /><span>khcho@hangilac.co.kr</span>
              </a>
            </address>
            <p className={styles.contactHint}>전화 또는 이메일로 바로 문의하셔도 됩니다.</p>
          </section>

          <section className={styles.formPanel} aria-label="연락처 남기기" data-assessment-id={assessmentId || undefined}>
            {submitted ? (
              <div className={styles.confirmation} role="status">
                <Check size={26} aria-hidden="true" />
                <h2 ref={confirmationRef} tabIndex={-1}>연락처 입력을 확인했습니다.</h2>
                <p>미리보기이므로 실제 접수·전송은 되지 않았습니다. 문의는 회계사님 전화 또는 이메일을 이용해 주세요.</p>
                <button type="button" className={styles.secondaryButton} onClick={() => { setSubmitted(false); setErrors({}); }}>다시 입력하기</button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <p className={styles.previewNote} id="contact-preview-note">미리보기 · 입력한 연락처는 전송되지 않습니다.</p>
                <label className={styles.phoneLabel} htmlFor="contact-phone">전화번호</label>
                <input id="contact-phone" ref={phoneRef} type="tel" inputMode="tel" autoComplete="tel"
                  maxLength={25} required placeholder="연락 가능한 전화번호" value={phone}
                  aria-invalid={Boolean(errors.phone)} aria-describedby={"contact-preview-note" + (errors.phone ? " contact-phone-error" : "")}
                  onChange={(event) => {
                    const input = event.currentTarget;
                    const raw = input.value;
                    const formatted = formatContactPhone(raw);
                    const caret = contactPhoneCaret(raw, input.selectionStart ?? raw.length, formatted);
                    pendingPhoneCaret.current = raw !== formatted ? caret : null;
                    setPhone(formatted);
                    setErrors((previous) => ({ ...previous, phone: undefined }));
                  }}
                  onKeyDown={(event) => {
                    const input = event.currentTarget;
                    const start = input.selectionStart;
                    if (start === null || start !== input.selectionEnd) return;
                    // Skip an inserted separator, then let the browser delete the adjacent digit.
                    if (event.key === "Backspace" && start > 0 && input.value[start - 1] === "-") input.setSelectionRange(start - 1, start - 1);
                    if (event.key === "Delete" && input.value[start] === "-") input.setSelectionRange(start + 1, start + 1);
                  }} />
                <label className={styles.consent}>
                  <input ref={consentRef} type="checkbox" required checked={consent}
                    aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "contact-consent-error" : undefined}
                    onChange={(event) => { setConsent(event.target.checked); setErrors((previous) => ({ ...previous, consent: undefined })); }} />
                  <span>연락 안내를 위한 전화번호 이용에 동의합니다.</span>
                </label>
                {errors.phone || errors.consent ? <div className={styles.errors} role="alert">
                  {errors.phone ? <p id="contact-phone-error">{errors.phone}</p> : null}
                  {errors.consent ? <p id="contact-consent-error">{errors.consent}</p> : null}
                </div> : null}
                <button className={styles.submit} type="submit">연락처 남기기 <ArrowRight size={18} aria-hidden="true" /></button>
              </form>
            )}
            {assessmentId ? <p className={styles.assessmentNote}>사전진단 결과가 연결되어 있습니다. <Link href={"/precheck/result?assessment_id=" + encodeURIComponent(assessmentId)}>결과 보기</Link></p> : null}
            {assessmentMismatch ? <p className={styles.assessmentNote} role="status">진단 ID가 달라 결과는 연결하지 않았습니다. 연락처만 입력할 수 있습니다.</p> : null}
          </section>
        </div>
      </section>
    </main>
  );
}
