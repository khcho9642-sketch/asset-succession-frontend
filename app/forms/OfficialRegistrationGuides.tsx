import { ExternalLink } from "lucide-react";
import catalog from "./official-registration-guides.json";
import styles from "./OfficialRegistrationGuides.module.css";

/** Official navigation only: do not copy or rewrite the institution's forms. */
export function OfficialRegistrationGuides() {
  return <section className={styles.root} id="official-registration-guides"
    aria-labelledby="registration-guides-title" data-official-registration-guides>
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>공식 기관 안내</p>
        <h2 id="registration-guides-title">등기·제출서류, 여기서 확인하세요.</h2>
      </div>
      <p className={styles.provider}>{catalog.provider}</p>
    </div>
    <p className={styles.intro}>부동산을 팔거나, 물려주거나, 나눌 때 필요한 서류와 작성 예시를 기관 원문으로 연결합니다.</p>
    <div className={styles.grid}>
      {catalog.guides.map(guide => <article className={styles.card} key={guide.id} data-registration-guide={guide.id}>
        <p className={styles.category}>{guide.label}</p>
        <h3>{guide.title}</h3>
        <p className={styles.description}>{guide.description}</p>
        <div className={styles.links}>
          <a href={guide.documentsUrl} target="_blank" rel="noopener noreferrer" data-official-documents
            aria-label={`${guide.title} 제출서류 안내 (공식 원문, 새 창)`}>
            제출서류 안내<ExternalLink size={15} aria-hidden="true" />
          </a>
          <a href={guide.examplesUrl} target="_blank" rel="noopener noreferrer" data-official-examples
            aria-label={`${guide.title} 신청서·작성 예시 (공식 원문, 새 창)`}>
            신청서·작성 예시<ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>
      </article>)}
    </div>
    <p className={styles.footnote}>외부 기관 원문이 새 창으로 열립니다. 부동산 등기 안내이며 세금 신고 안내와는 구분됩니다.
      <span>원문 확인일 <time dateTime={catalog.checkedAt}>{catalog.checkedAt}</time></span>
    </p>
  </section>;
}
