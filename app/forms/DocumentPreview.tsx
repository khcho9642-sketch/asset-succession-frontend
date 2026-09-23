"use client";

// Official images use intrinsic dimensions; no stretching or third-party image proxy.
import { useEffect, useId, useState } from "react";
import { previewCoverage, previewRoleLabel, resolvePreview, type PreviewDocument } from "@/lib/forms/preview";
import styles from "./DocumentPreview.module.css";

type Props = { item: PreviewDocument };

export function PreviewThumbnail({ item }: Props) {
  const preview = resolvePreview(item);
  const [broken, setBroken] = useState<string[]>([]);
  const image = [preview.thumbnailPath, preview.imagePath].find(path => path && !broken.includes(path));
  if (image) return <img className={styles.thumbnail} src={image} loading="lazy" decoding="async"
    alt={`${item.title} · ${previewRoleLabel(preview.role)} 미리보기`}
    onError={() => setBroken(paths => [...paths, image])} />;
  const label = preview.pdfPath ? "PDF 미리보기" : preview.kind === "provider" ? "제공처 이용 안내" : "미리보기 준비 중";
  return <span className={styles.cardState} data-preview-state={preview.pdfPath ? "pdf" : preview.kind === "provider" ? "provider" : "pending"}>
    <strong>{label}</strong><span>{preview.pdfPath ? "자료 상세에서 확인" : preview.kind === "provider" ? "이용 방법과 제공처 확인" : "원본 파일·제공처 확인"}</span>
  </span>;
}

export function PreviewCoverage({ items }: { items: readonly PreviewDocument[] }) {
  const counts = previewCoverage(items);
  if (!counts.total) return null;
  return <p className={styles.coverage} aria-label="현재 검색 결과의 미리보기 지원 현황" data-preview-coverage>
    <span>미리보기 지원 {counts.ready}개</span><span>제공처 안내 {counts.provider}개</span>
    {counts.pending > 0 && <span data-pending="true">미리보기 준비 중 {counts.pending}개</span>}
  </p>;
}

function PdfPreview({ path, title }: { path: string; title: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    fetch(path, { method: "HEAD", signal: controller.signal }).then(response => {
      const type = response.headers.get("content-type") || "";
      if (!response.ok || /text\/html/i.test(type)) throw new Error("Preview file unavailable");
      if (active) setState("ready");
    }).catch(() => { if (active) setState("error"); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [path]);
  return <>
    {state === "loading" && <p className={styles.notice} role="status">PDF 파일을 확인하고 있습니다.</p>}
    {state === "ready" && <iframe className={styles.pdf} src={`${path}#page=1&view=FitH`} title={`${title} PDF 미리보기`} loading="lazy" />}
    {state === "error" && <p className={`${styles.notice} ${styles.pending}`} role="status">미리보기 파일을 불러오지 못했습니다. 아래 새 창 링크 또는 원본 다운로드를 이용하세요.</p>}
    <p className={styles.caption}>브라우저에서 PDF가 표시되지 않으면 <a href={path} target="_blank" rel="noopener noreferrer">PDF를 새 창에서 여세요.</a> 원본 다운로드는 위 제공 파일에서 이용할 수 있습니다.</p>
  </>;
}

export function DocumentPreview({ item }: Props) {
  const preview = resolvePreview(item);
  const headingId = useId();
  const [fit, setFit] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const [wholeDocument, setWholeDocument] = useState(false);
  const showImage = !!preview.imagePath && !imageFailed && !wholeDocument;
  const showPdf = !!preview.pdfPath && !showImage;
  const unavailable = !showImage && !showPdf && preview.kind !== "provider";
  return <section className={styles.panel} aria-labelledby={headingId}
    data-document-preview data-preview-state={unavailable ? "pending" : showPdf ? "pdf" : preview.kind}
    data-preview-method={preview.method} data-preview-kind={preview.role}
    data-preview-low-resolution={preview.lowResolution ? "true" : undefined}>
    <div className={styles.header}>
      <h3 id={headingId}>{unavailable ? "미리보기 준비 중" : preview.label}</h3>
      {(showImage || showPdf) && <div className={styles.tools}>
        {showImage && <button type="button" aria-pressed={!fit} onClick={() => setFit(value => !value)}>{fit ? "원본 크기로 보기" : "화면에 맞추기"}</button>}
        {preview.imagePath && !imageFailed && preview.pdfPath && <button type="button" aria-pressed={wholeDocument} onClick={() => setWholeDocument(value => !value)}>{wholeDocument ? "첫 페이지 보기" : "전체 PDF 보기"}</button>}
        <a href={(showPdf ? preview.pdfPath : preview.imagePath)!} target="_blank" rel="noopener noreferrer">새 창에서 보기</a>
      </div>}
    </div>
    {showImage && <>
      <div className={styles.frame} tabIndex={0} aria-label="문서 이미지 스크롤 영역">
        <img src={preview.imagePath} alt={`${item.title} · ${previewRoleLabel(preview.role)}`}
          width={preview.width} height={preview.height} style={{ maxWidth: fit ? "100%" : "none", width: "auto", height: "auto" }}
          onError={() => setImageFailed(true)} />
      </div>
      <p className={styles.caption}>{previewRoleLabel(preview.role)}{preview.width && preview.height ? ` · ${preview.width} × ${preview.height}px` : ""}
        {preview.sourcePages ? ` · 기관 원본 ${preview.sourcePages.join("~")}쪽 발췌 (내용 변경 없음)` : ""}
        {preview.pageCount ? ` · 전체 ${preview.pageCount}쪽 중 첫 페이지` : ""}
        {preview.lowResolution ? " · 저해상도 원본은 화질을 높여 재작성하지 않았습니다. 원본 파일도 함께 확인하세요." : " · 제공 파일을 바탕으로 표시한 문서이며, 임의로 그린 견본이 아닙니다."}
      </p>
    </>}
    {showPdf && <PdfPreview key={preview.pdfPath} path={preview.pdfPath!} title={item.title} />}
    {preview.kind === "provider" && <div className={styles.notice}>
      <strong>{item.institution || "자료 제공처"}에서 확인하는 자료입니다.</strong>
      <p>이 사이트에는 원본 파일을 보관하지 않습니다. 빈 미리보기 대신 이용 경로를 안내합니다.</p>
      <ol><li>제공처에서 ‘{item.title}’ 자료 또는 서비스를 확인하세요.</li><li>최신 서식과 신청·열람 자격, 인증 및 준비 서류를 확인하세요.</li><li>자료의 상세 사용 방법은 아래 이용 안내를 함께 확인하세요.</li></ol>
      <a className={styles.link} href={preview.providerUrl} target="_blank" rel="noopener noreferrer">제공처에서 확인 · 새 창</a>
    </div>}
    {unavailable && <div className={`${styles.notice} ${styles.pending}`} role="status">
      <strong>{imageFailed ? "문서 이미지를 불러오지 못했습니다." : "이 자료의 문서 미리보기가 아직 준비되지 않았습니다."}</strong>
      <p>미리보기가 없는 항목은 완료로 표시하지 않습니다. 위 제공 파일에서 원본을 받거나 제공처를 확인하세요.</p>
      {preview.originalPath && <a className={styles.link} href={preview.originalPath} download>원본 파일 받기</a>}
      {!preview.originalPath && preview.providerUrl && <a className={styles.link} href={preview.providerUrl} target="_blank" rel="noopener noreferrer">제공처에서 확인</a>}
    </div>}
  </section>;
}
