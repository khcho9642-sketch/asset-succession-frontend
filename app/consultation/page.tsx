"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Mail, MessageCircle, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { PublicNav } from "@/components/PublicNav";
import { readAssessmentFromSession } from "@/lib/assessment";
import { KAKAO_OPEN_CHAT_URL } from "@/lib/contactLinks";
import homeStyles from "@/components/HomePage.module.css";
import styles from "./Consultation.module.css";

const careers = [
  "한길회계법인 이사",
  "전 삼일회계법인",
  "금융위원회·금융감독원 자문 경험",
  "회계감사 자동화·AI 업무설계·전문가 교육 기획 및 구현"
];

const serviceRows = [
  {
    label: "무료 AI 사전진단",
    content: "입력한 가족·자산 정보를 바탕으로 지원 범위 내 추정 계산과 검토 방향 안내",
    result: "사전진단 결과·무료 보고서",
    fee: "무료"
  },
  {
    label: "자산승계 컨설팅",
    content: "자료와 적용 조건을 확인하고 상속·증여·양도·가업승계 대안 검토",
    result: "대안 비교·필요자금·주의사항·실행 순서를 담은 검토 결과",
    fee: "업무 범위 확인 후 견적"
  },
  {
    label: "신고대행",
    content: "계약한 세목의 자료 검토·세액 계산·신고서 작성·제출",
    result: "신고서·접수증·해당 시 납부 안내자료",
    fee: "아래 세목별 상세 보수표 참고"
  }
];

const summaryRows = [
  { work: "상속세 신고", base: "200만원부터", vat: "220만원부터", scope: "재산·공제 검토, 세액 계산, 신고서 작성·제출" },
  { work: "증여세 신고", base: "30만원부터", vat: "33만원부터", scope: "증여재산·공제 검토, 세액 계산, 신고서 작성·제출" },
  { work: "양도소득세 신고 — 일반 과세", base: "45만원부터", vat: "49만 5천원부터", scope: "취득가액·필요경비·공제 검토, 세액 계산, 신고서 작성·제출" },
  { work: "단순 1세대1주택 비과세 요건 검토", base: "30만원", vat: "33만원", scope: "비과세 요건 확인과 검토 결과 안내. 실제 신고 여부는 검토 후 결정" }
];

type FeeRow = {
  range: string;
  formula: string;
  total: string;
};

type FeeSection = {
  id: string;
  title: string;
  basis: string;
  rows: FeeRow[];
  exampleTitle: string;
  exampleLines: string[];
  includedTitle: string;
  included: { step: string; content: string }[];
  materials: string;
  extra: string;
};

const inheritanceRows = [
  { range: "5억원 이하", formula: "200만원", total: "220만원" },
  { range: "5억원 초과~10억원 이하", formula: "200만원 + 5억원 초과액 × 0.2%", total: "220만원 초과~330만원" },
  { range: "10억원 초과~20억원 이하", formula: "300만원 + 10억원 초과액 × 0.25%", total: "330만원 초과~605만원" },
  { range: "20억원 초과~30억원 이하", formula: "550만원 + 20억원 초과액 × 0.2%", total: "605만원 초과~825만원" },
  { range: "30억원 초과~50억원 이하", formula: "750만원 + 30억원 초과액 × 0.15%", total: "825만원 초과~1,155만원" },
  { range: "50억원 초과~100억원 이하", formula: "1,050만원 + 50억원 초과액 × 0.1%", total: "1,155만원 초과~1,705만원" },
  { range: "100억원 초과", formula: "별도 견적", total: "부가세 포함 총액으로 안내" }
];

const giftRows = [
  { range: "1억원 이하", formula: "30만원", total: "33만원" },
  { range: "1억원 초과~3억원 이하", formula: "30만원 + 1억원 초과액 × 0.075%", total: "33만원 초과~49만 5천원" },
  { range: "3억원 초과~5억원 이하", formula: "45만원 + 3억원 초과액 × 0.125%", total: "49만 5천원 초과~77만원" },
  { range: "5억원 초과~10억원 이하", formula: "70만원 + 5억원 초과액 × 0.1%", total: "77만원 초과~132만원" },
  { range: "10억원 초과~30억원 이하", formula: "120만원 + 10억원 초과액 × 0.08%", total: "132만원 초과~308만원" },
  { range: "30억원 초과~50억원 이하", formula: "280만원 + 30억원 초과액 × 0.06%", total: "308만원 초과~440만원" },
  { range: "50억원 초과", formula: "별도 견적", total: "부가세 포함 총액으로 안내" }
];

const capitalGainsRows = [
  { range: "단순 1세대1주택 비과세 요건 검토", formula: "30만원", total: "33만원" },
  { range: "일반 과세 — 5억원 이하", formula: "45만원", total: "49만 5천원" },
  { range: "일반 과세 — 5억원 초과~10억원 이하", formula: "60만원", total: "66만원" },
  { range: "일반 과세 — 10억원 초과~30억원 이하", formula: "90만원", total: "99만원" },
  { range: "일반 과세 — 30억원 초과~50억원 이하", formula: "135만원", total: "148만 5천원" },
  { range: "50억원 초과", formula: "별도 견적", total: "부가세 포함 총액으로 안내" }
];

const feeSections: FeeSection[] = [
  {
    id: "inheritance-fee",
    title: "상속세 신고",
    basis: "보수 산정 기준: 상속재산 총액(사전증여 포함, 채무 차감 전). 세금을 계산하는 과세표준이 아니라 보수를 산정하기 위한 재산금액입니다.",
    rows: inheritanceRows,
    exampleTitle: "계산 예시: 상속재산 15억원",
    exampleLines: [
      "기본 보수: 300만원 + (15억원 - 10억원) × 0.25% = 425만원",
      "부가세: 42만 5천원",
      "기본 보수 합계: 467만 5천원"
    ],
    includedTitle: "기본 보수에 포함되는 업무",
    included: [
      { step: "자료 준비", content: "상속인 관계와 재산 구성을 확인하고 필요한 서류 목록 안내" },
      { step: "재산·채무 검토", content: "제출된 부동산·금융재산·채무·증빙과 재산별 신고가액 근거 검토" },
      { step: "사전증여·공제 검토", content: "제출된 증여 이력과 합산 대상 검토, 확정된 재산분할안을 바탕으로 적용 공제 검토" },
      { step: "계산·신고", content: "세액 계산, 신고 전 주요 내용 설명과 고객 확인, 신고서·명세서 작성·제출" },
      { step: "납부·보완 안내", content: "해당 시 납부세액·기한 안내, 계약 범위 내 신고 보완자료 제출 지원" }
    ],
    materials: "재산·채무와 공제·세액 계산명세, 신고서 사본, 접수증, 해당하는 경우 납부 안내자료.",
    extra: "비상장주식 평가, 감정평가, 등기, 분쟁·소송 관련 업무, 가업승계 특례의 심층 검토, 정식 세무조사 대응. 연부연납·물납 신청 등의 포함 여부는 견적서에 표시합니다."
  },
  {
    id: "gift-fee",
    title: "증여세 신고",
    basis: "보수 산정 기준: 이번 신고 대상 증여재산 가액. 증여재산공제 등을 적용한 과세표준과 구분합니다.",
    rows: giftRows,
    exampleTitle: "계산 예시: 증여재산 8억원",
    exampleLines: [
      "기본 보수: 70만원 + (8억원 - 5억원) × 0.1% = 100만원",
      "부가세: 10만원",
      "기본 보수 합계: 110만원"
    ],
    includedTitle: "기본 보수에 포함되는 업무",
    included: [
      { step: "거래 확인", content: "증여자·수증자 관계, 증여일, 재산 종류·금액과 거래 증빙 확인" },
      { step: "재산가액 검토", content: "현금·일반 부동산 등 신고 대상 재산의 가액과 평가 근거 검토" },
      { step: "증여 이력·공제", content: "제출된 과거 증여 내역의 합산 여부와 공제 적용 검토" },
      { step: "계산·신고", content: "세액 계산, 신고 전 주요 내용 설명과 고객 확인, 신고서·첨부자료 작성·제출" },
      { step: "납부·보완 안내", content: "해당 시 납부세액·기한 안내, 계약 범위 내 신고 보완자료 제출 지원" }
    ],
    materials: "증여재산 및 공제·세액 계산명세, 신고서 사본, 접수증, 해당하는 경우 납부 안내자료.",
    extra: "비상장주식 평가, 감정평가, 등기, 부담부증여의 양도소득세 신고, 여러 수증자·시기를 조합하는 증여계획 설계, 가업승계 특례의 심층 검토."
  },
  {
    id: "capital-gains-fee",
    title: "양도소득세 신고·비과세 검토",
    basis: "보수 산정 기준: 국내 부동산의 일반적인 양도 업무를 기준으로 하며, 양도차익이 아니라 양도가액(거래금액)을 기준으로 합니다.",
    rows: capitalGainsRows,
    exampleTitle: "계산 예시: 일반 과세 부동산 양도가액 8억원",
    exampleLines: [
      "기본 보수: 60만원",
      "부가세: 6만원",
      "기본 보수 합계: 66만원"
    ],
    includedTitle: "일반 과세 신고에 포함되는 업무",
    included: [
      { step: "거래·취득 내역", content: "매매계약서, 취득자료, 소유관계와 거래일자 검토" },
      { step: "취득가액·필요경비", content: "취득대금·관련 비용·중개보수·공사비 등 제출 증빙의 반영 여부 검토" },
      { step: "세율·공제", content: "보유·거주기간, 주택 보유 현황, 적용 세율·공제·감면의 기본 요건 검토" },
      { step: "계산·신고", content: "세액 계산, 신고 전 주요 내용 설명과 고객 확인, 신고서 작성·제출" },
      { step: "지방소득세·납부", content: "해당 양도 건의 개인지방소득세 신고와 납부 안내를 함께 제공하는 구성" }
    ],
    materials: "양도차익·필요경비·공제·세액 계산명세, 신고서 사본, 접수증, 해당하는 경우 납부 안내자료.",
    extra: "복수 자산·거래의 합산신고, 별도로 필요한 확정신고, 해외자산·주식 양도, 취득자료 복원, 복잡한 감면·특례 검토. 중복 자료 검토는 견적 단계에서 조정합니다."
  }
];

const simpleHomeRows = [
  { step: "제공 업무", content: "주택 보유 현황, 취득·양도 시점, 보유·거주기간과 제출자료에 따른 요건 검토" },
  { step: "제공 자료", content: "사실관계·판단 근거·추가 확인사항을 정리한 검토 결과" },
  { step: "신고 여부", content: "검토 결과에 따른 신고 필요성과 고객 요청을 확인해 업무 범위를 확정" },
  { step: "일반 신고로 변경", content: "과세 부분 계산·추가 쟁점이 있으면 변경 업무와 최종 총보수를 사전에 안내" }
];

const additionalRows = [
  { situation: "증여·양도의 추가 쟁점 검토", fee: "해당 기본 보수의 25~50% 가산 가능", notice: "실제 쟁점·추가 자료·가산율·금액" },
  { situation: "부담부증여", fee: "증여세·양도세 신고 보수 구분", notice: "두 신고의 포함 여부와 전체 합계" },
  { situation: "가업승계·해외재산·복잡한 지분거래", fee: "별도 견적", notice: "지원 범위·평가·특례·사후관리 포함 여부" },
  { situation: "비상장주식 평가", fee: "신고 보수와 별도", notice: "대상 법인·기준일·평가 범위·결과물" },
  { situation: "감정평가·등기 등 외부 업무", fee: "외부 전문가 보수 별도", notice: "수행 주체·지급 대상·예상 비용" },
  { situation: "수임 신고의 통상적 보완자료 제출", fee: "계약한 범위에서 기본 보수에 포함", notice: "지원 범위·기간" },
  { situation: "정식 세무조사·조세불복·별도 경정청구", fee: "별도 계약", notice: "대상 세목·기간·업무 단계·보수" },
  { situation: "자산승계 컨설팅", fee: "업무 범위 확인 후 견적", notice: "비교 대안·결과물·신고와 중복 업무의 조정" }
];

const billingRows = [
  { type: "상속세", unit: "피상속인 1명에 대한 상속세 신고 1건", multiple: "상속인 수만큼 기본 보수를 반복 부과하지 않음. 추가 업무는 별도 설명" },
  { type: "증여세", unit: "수증자 1명·증여거래 1건", multiple: "여러 수증자·거래는 건별 산정 내역과 합계 보수 안내" },
  { type: "양도소득세", unit: "양도자 1명·부동산 1건", multiple: "공동명의는 각자의 지분 양도가액을 기준으로 산정하는 안. 일괄 의뢰는 중복 업무를 고려해 합계 견적 확정" },
  { type: "복수 세목·컨설팅 결합", unit: "포함 업무별 구분", multiple: "동일 자료 검토의 중복 범위를 조정해 최종 총액 안내" }
];

function DetailTable({ rows }: { rows: { step: string; content: string }[] }) {
  return <div className={styles.detailList}>
    {rows.map((row) => <div key={row.step}>
      <strong>{row.step}</strong>
      <p>{row.content}</p>
    </div>)}
  </div>;
}

function ResponsiveTable({ ariaLabel, headers, rows }: { ariaLabel: string; headers: string[]; rows: string[][] }) {
  return <>
    <div className={styles.tableWrap}>
      <table className={styles.dataTable} aria-label={ariaLabel}>
        <thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.join("|")}>{row.map((cell, index) => index === 0 ? <th key={cell} scope="row">{cell}</th> : <td key={cell}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
    <div className={styles.mobileCards} aria-label={`${ariaLabel} 모바일 카드`}>
      {rows.map((row) => <article className={styles.mobileCard} key={row.join("|")}>
        <h4>{row[0]}</h4>
        {row.slice(1).map((cell, index) => <p key={`${row[0]}-${headers[index + 1]}`}><span>{headers[index + 1]}</span>{cell}</p>)}
      </article>)}
    </div>
  </>;
}

function FeeDisclosure({ section }: { section: FeeSection }) {
  return <details className={styles.feeDisclosure} open>
    <summary>{section.title}<span>{section.rows.length}개 구간 전체 보기</span></summary>
    <p className={styles.basis}>{section.basis}</p>
    <ResponsiveTable
      ariaLabel={`${section.title} 상세 보수표`}
      headers={["보수 산정 대상", "기본 보수 산식·부가세 별도", "부가세 포함 기본 보수"]}
      rows={section.rows.map((row) => [row.range, row.formula, row.total])}
    />
    <div className={styles.exampleBox}>
      <h4>{section.exampleTitle}</h4>
      <ul>{section.exampleLines.map((line) => <li key={line}>{line}</li>)}</ul>
    </div>
    <h4 className={styles.subheading}>{section.includedTitle}</h4>
    <DetailTable rows={section.included} />
    <div className={styles.noteGrid}>
      <article><h4>제공 자료</h4><p>{section.materials}</p></article>
      <article><h4>별도 검토·비용</h4><p>{section.extra}</p></article>
    </div>
  </details>;
}

function ContactLinks({ assessmentId, assessmentMismatch }: { assessmentId: string; assessmentMismatch: boolean }) {
  return <address className={styles.contacts}>
    <a className={styles.kakaoButton} href={KAKAO_OPEN_CHAT_URL} target="_blank" rel="noopener noreferrer" aria-label="카카오톡 상담하기 (새 창)">
      <MessageCircle size={19} aria-hidden="true" /><span>카카오톡 상담하기</span>
    </a>
    <a href="tel:01089309642" className={styles.phoneLink}><Phone size={19} aria-hidden="true" /><span>010-8930-9642</span></a>
    <a href="mailto:khcho@hangilac.co.kr"><Mail size={19} aria-hidden="true" /><span>khcho@hangilac.co.kr</span></a>
    {assessmentId ? <p className={styles.assessmentNote}>이 브라우저의 사전진단 결과입니다. <Link href={"/precheck/result?assessment_id=" + encodeURIComponent(assessmentId)}>결과 보기</Link></p> : null}
    {assessmentMismatch ? <p className={styles.assessmentNote} role="status">진단 ID가 달라 결과를 연결하지 않았습니다. 직접 문의는 이용할 수 있습니다.</p> : null}
  </address>;
}

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
        <h1 id="contact-title">필요한 범위만 확인하고 상담을 시작하세요.</h1>
        <p>무료 사전진단은 유지하고, 전문가 검토와 신고대행은 업무 범위를 확인한 뒤 진행합니다.</p>
      </header>

      <section className={styles.heroPanel} aria-labelledby="profile-title">
        <div className={styles.photoWrap}>
          <Image src="/images/cho-kyungho-profile.png" alt="상담 담당자 프로필 사진" width={1254} height={1254} priority sizes="(max-width: 700px) 170px, 250px" />
        </div>
        <div className={styles.profileCopy}>
          <p className={styles.sectionLabel}>전문가 프로필</p>
          <h2 id="profile-title">왜 조경호 회계사인가</h2>
          <p className={styles.name}>조경호 <span>공인회계사</span></p>
          <ul className={styles.careerList}>
            {careers.map((career) => <li key={career}>{career}</li>)}
          </ul>
          <p className={styles.profileLead}>회계·세무 전문성과 AI 구현 경험을 바탕으로, 가족의 자산승계 대안과 실행 순서를 함께 검토합니다.</p>
          <p className={styles.boundaryNote}>무료 AI 사전진단에는 전문가의 개별 검토가 포함되지 않습니다. 전문가 검토는 별도 의뢰 후 진행합니다.</p>
        </div>
      </section>

      <section className={styles.directContact} aria-labelledby="direct-contact-title">
        <div>
          <p className={styles.sectionLabel}>직접 문의</p>
          <h2 id="direct-contact-title">카카오톡·전화·이메일로 문의</h2>
          <p>상담 연결 전에 무료 보고서와 사전진단 결과를 함께 확인할 수 있습니다.</p>
        </div>
        <ContactLinks assessmentId={assessmentId} assessmentMismatch={assessmentMismatch} />
      </section>

      <section className={styles.sectionBlock} aria-labelledby="service-scope-title">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>업무 범위와 보수 안내</p>
          <h2 id="service-scope-title">자산승계 방향 검토부터 신고대행까지</h2>
          <p>자산승계 방향을 정하기 위한 컨설팅부터 신고대행까지, 필요한 업무만 의뢰하실 수 있습니다.</p>
        </div>
        <ResponsiveTable
          ariaLabel="업무 범위와 보수 안내"
          headers={["구분", "제공 내용", "받는 결과물", "보수"]}
          rows={serviceRows.map((row) => [row.label, row.content, row.result, row.fee])}
        />
        <p className={styles.finePrint}>컨설팅과 신고대행은 각각 의뢰할 수 있습니다. 함께 의뢰하는 경우에는 포함 업무와 중복되는 검토 범위를 구분합니다.</p>
        <div className={styles.quickActions}>
          <Link href="/precheck">무료 AI 사전진단 시작 <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/sample-report">무료 보고서 예시 보기 <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className={styles.sectionBlock} aria-labelledby="fee-summary-title">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>신고 업무 시작가격 요약</p>
          <h2 id="fee-summary-title">재산 규모에 따른 기본 보수</h2>
          <p>자료와 업무 범위를 확인한 뒤 최종 견적을 안내하며, 고객 동의 후 업무를 시작합니다.</p>
        </div>
        <ResponsiveTable
          ariaLabel="신고 업무 시작가격 요약"
          headers={["업무", "기본 보수·부가세 별도", "부가세 포함 기본 금액", "제공 내용"]}
          rows={summaryRows.map((row) => [row.work, row.base, row.vat, row.scope])}
        />
        <p className={styles.finePrint}>부가세 포함 금액은 기본 보수에 부가세 10%를 더한 금액입니다. 추가 검토와 외부 전문가 비용은 포함하지 않습니다. 표시 금액은 신고·검토 보수이며 고객이 납부할 세금과는 별개입니다.</p>
      </section>

      <section className={styles.sectionBlock} aria-labelledby="fee-detail-title">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>상세 보수표</p>
          <h2 id="fee-detail-title">상속세·증여세·양도소득세 전체 구간</h2>
          <p>하한은 초과, 상한은 이하 기준입니다. 표 범위를 넘는 금액은 마지막 요율을 자동 연장하지 않고 별도 견적으로 안내합니다.</p>
        </div>
        <div className={styles.disclosureStack}>
          {feeSections.map((section) => <FeeDisclosure section={section} key={section.id} />)}
        </div>
        <section className={styles.subSection} aria-labelledby="home-review-title">
          <h3 id="home-review-title">단순 비과세 검토 안내</h3>
          <DetailTable rows={simpleHomeRows} />
          <p className={styles.finePrint}>비과세 확정, 모든 건 신고 접수증 제공, 무조건 33만원으로 신고까지 완료라고 표현하지 않습니다. 비과세 요건 검토와 일반 신고를 동시에 자동 과금하지 않습니다.</p>
        </section>
      </section>

      <section className={styles.sectionBlock} aria-labelledby="additional-fees-title">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>추가 검토·외부 비용</p>
          <h2 id="additional-fees-title">사유와 비용을 안내하고 동의 후 진행</h2>
        </div>
        <ResponsiveTable
          ariaLabel="추가 검토 보수와 외부 비용"
          headers={["상황", "보수 적용", "사전 안내할 내용"]}
          rows={additionalRows.map((row) => [row.situation, row.fee, row.notice])}
        />
        <div className={styles.exampleBox}>
          <h4>가산 예시</h4>
          <p>기본 보수 60만원 + 추가 검토 25%(15만원) + 부가세 7만 5천원 = <strong>82만 5천원</strong></p>
        </div>
      </section>

      <section className={styles.sectionBlock} aria-labelledby="billing-unit-title">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>신고 1건의 기준</p>
          <h2 id="billing-unit-title">과금 단위 제안</h2>
        </div>
        <ResponsiveTable
          ariaLabel="신고 1건의 기준"
          headers={["구분", "기본 과금 단위", "복수 건 처리"]}
          rows={billingRows.map((row) => [row.type, row.unit, row.multiple])}
        />
      </section>

      <section className={styles.noticePanel} aria-labelledby="notice-title">
        <h2 id="notice-title">의뢰 전에 업무 범위와 총비용을 확인하세요.</h2>
        <p>표시된 금액은 신고·검토 업무의 기본 보수이며, 고객이 납부할 세금과는 별개입니다. 견적서에는 기본 보수, 추가 검토 보수, 부가세, 외부 비용의 포함 여부를 구분합니다.</p>
        <p>신고를 위한 통상적인 자료·공제·세액 검토는 기본 업무에 포함합니다. 여러 시기·수증자·이전 방법을 비교해 계획을 설계하는 자산승계 컨설팅은 별도 업무입니다.</p>
        <p>컨설팅을 먼저 받지 않아도 신고대행만 의뢰할 수 있습니다. 함께 의뢰하는 경우 중복되는 검토 범위를 조정합니다.</p>
        <p>최초 계약 범위를 넘는 업무가 필요하면 내용과 비용을 안내하고 동의 후 진행합니다. 변경·취소·정산 기준은 계약 전에 안내합니다.</p>
      </section>

      <section className={styles.finalContact} aria-labelledby="final-contact-title">
        <div>
          <p className={styles.sectionLabel}>상담 시작</p>
          <h2 id="final-contact-title">읽어본 내용으로 바로 문의하세요.</h2>
          <p>버튼 클릭만으로 접수가 완료되는 것은 아니며, 카카오톡·전화·이메일로 직접 연락해 상담 범위를 확인합니다.</p>
        </div>
        <ContactLinks assessmentId={assessmentId} assessmentMismatch={assessmentMismatch} />
      </section>
    </section>
  </main>;
}
