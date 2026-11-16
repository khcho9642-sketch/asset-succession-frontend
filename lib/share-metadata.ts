import type { Metadata } from "next";

export const PUBLIC_SITE_URL = "https://asset360.intellic.co.kr";
export const SHARE_IMAGE_PATH = "/media/asset360-share-20261116.png";
const title = "자산승계 360 | 우리 가족의 자산승계 준비";
const description = "상속·증여·양도·가업승계, 우리 가족에게 맞는 준비를 시작하세요. 자산승계 사전진단과 서류 자료실을 한곳에서 확인합니다.";

export function createShareMetadata(options: { title?: string; description?: string; path?: string } = {}): Metadata {
  const pageTitle = options.title ?? title;
  const pageDescription = options.description ?? description;
  const url = options.path ? new URL(options.path, PUBLIC_SITE_URL).href : undefined;
  const image = {
    url: new URL(SHARE_IMAGE_PATH, PUBLIC_SITE_URL).href,
    width: 1200,
    height: 630,
    type: "image/png",
    alt: "자산승계 360 - 오늘의 준비가 내일의 가족을 지킵니다. 상속·증여·양도·가업승계",
  };

  return {
    metadataBase: new URL(PUBLIC_SITE_URL),
    title: pageTitle,
    description: pageDescription,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: "자산승계 360",
      title: pageTitle,
      description: pageDescription,
      ...(url ? { url } : {}),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: pageDescription,
      images: [image],
    },
  };
}
