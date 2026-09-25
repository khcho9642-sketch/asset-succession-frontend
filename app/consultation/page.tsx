"use client";

import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { PublicNav } from "@/components/PublicNav";
import { readAssessmentFromSession } from "@/lib/assessment";
import { KAKAO_OPEN_CHAT_URL } from "@/lib/contactLinks";
import homeStyles from "@/components/HomePage.module.css";
import styles from "./Consultation.module.css";

export default function ConsultationPage() {
  const [assessmentId, setAssessmentId] = useState("");
  const [assessmentMismatch, setAssessmentMismatch] = useState(false);
  useEffect(() => {
    try {
      const result = readAssessmentFromSession();
      if (result.status === "ready") setAssessmentId(result.snapshot.assessment_id);
      else if (result.status === "mismatch") setAssessmentMismatch(true);
    } catch {
      // Direct contact links remain available without browser storage.
    }
  }, []);

  return <main className={`${homeStyles.paperTheme} ${styles.page}`}>
    <PublicNav />
    <section className={styles.content} aria-labelledby="contact-title">
      <header className={styles.intro}>
        <p className={styles.eyebrow}>자산승계 상담</p>
        <h1 id="contact-title">편한 방법으로 문의해 주세요.</h1>
        <p>자세한 이야기는 상담할 때 나누면 됩니다.</p>
      </header>
      <section className={styles.professional} aria-labelledby="professional-name">
        <p className={styles.sectionLabel}>직접 문의</p>
        <h2 id="professional-name">조경호 <span>회계사</span></h2>
        <address className={styles.contacts}>
          <a className={styles.kakaoButton} href={KAKAO_OPEN_CHAT_URL} target="_blank" rel="noopener noreferrer" aria-label="카카오톡 상담하기 (새 창)">
            <MessageCircle size={19} aria-hidden="true" /><span>카카오톡 상담하기</span>
          </a>
          <a href="tel:01089309642" className={styles.phoneLink}><Phone size={19} aria-hidden="true" /><span>010-8930-9642</span></a>
          <a href="mailto:khcho@hangilac.co.kr"><Mail size={19} aria-hidden="true" /><span>khcho@hangilac.co.kr</span></a>
        </address>
        <p className={styles.contactHint}>카카오톡, 전화 또는 이메일로 바로 문의하실 수 있습니다.</p>
        {assessmentId ? <p className={styles.assessmentNote}>이 브라우저의 사전진단 결과입니다. <Link href={"/precheck/result?assessment_id=" + encodeURIComponent(assessmentId)}>결과 보기</Link></p> : null}
        {assessmentMismatch ? <p className={styles.assessmentNote} role="status">진단 ID가 달라 결과를 연결하지 않았습니다. 직접 문의는 이용할 수 있습니다.</p> : null}
      </section>
    </section>
  </main>;
}
