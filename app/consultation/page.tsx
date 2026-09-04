import { MockNotice } from "@/components/MockNotice";

export default function ConsultationPage() {
  return (
    <main className="page-shell">
      <MockNotice />
      <section className="panel wide">
        <p className="eyebrow">상담 신청</p>
        <h1>지금 단계에서는 실제 개인정보를 받지 않는 신청 화면 목업입니다.</h1>
        <div className="form-grid">
          <label>호칭<input defaultValue="예: 신청자 A" aria-label="호칭" /></label>
          <label>관심 시나리오<select defaultValue="partial"><option value="partial">일부 증여</option><option>부담부증여</option><option>상속 비교</option></select></label>
          <label>연락 방식<select defaultValue="later"><option value="later">추후 입력</option><option>전화 상담</option><option>이메일 상담</option></select></label>
          <label>메모<textarea defaultValue="실제 연락처나 주소를 입력하지 않는 mock 영역입니다." aria-label="메모" /></label>
        </div>
        <button className="button primary" type="button">mock 상담 요청 저장</button>
      </section>
    </main>
  );
}
