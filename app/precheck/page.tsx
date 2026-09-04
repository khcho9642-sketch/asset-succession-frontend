import Link from "next/link";
import { MockNotice } from "@/components/MockNotice";

export default function PrecheckPage() {
  return (
    <main className="page-shell">
      <MockNotice />
      <section className="panel wide">
        <p className="eyebrow">무가입 사전계산 입력</p>
        <h1>개인정보 없이 시나리오 조건만 입력합니다.</h1>
        <div className="form-grid">
          <label>자산 유형<select defaultValue="apartment"><option value="apartment">주거용 부동산</option><option>상가</option><option>현금</option></select></label>
          <label>예상 평가액<input defaultValue="1,200,000,000" aria-label="예상 평가액" /></label>
          <label>검토 방식<select defaultValue="gift"><option value="gift">일부 증여</option><option>매각 후 증여</option><option>상속 유지</option></select></label>
          <label>이전 지분율<input defaultValue="30%" aria-label="이전 지분율" /></label>
          <label>채무 인수 여부<select defaultValue="none"><option value="none">없음</option><option>금융기관 채무</option><option>임대보증금</option></select></label>
          <label>전문가 검토 필요 항목<input defaultValue="평가방법, 취득세, 과거 증여" aria-label="전문가 검토 필요 항목" /></label>
        </div>
        <div className="actions">
          <Link className="button primary" href="/precheck/result">mock 결과 보기</Link>
          <Link className="button ghost" href="/">돌아가기</Link>
        </div>
      </section>
    </main>
  );
}
