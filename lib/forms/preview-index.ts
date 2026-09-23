/** Server/build-time only. Original manifest and official downloads are immutable. */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import type { LibraryDocument } from "./catalog";
import { localArtifact } from "./preview";

type GeneratedRecord = {
  example: string;
  thumbnail: string;
  preview: NonNullable<LibraryDocument["preview"]> & {
    sourcePath: string; sourceSha256: string; imageSha256: string; thumbnailSha256: string;
    pdfPath?: string; pdfSha256?: string; pdfBytes?: number; sourcePages?: number[]; editorialRedraw: false;
  };
};

export function mergeGeneratedPreviews(documents: LibraryDocument[]): LibraryDocument[] {
  const publicDir = realpathSync(resolve(process.cwd(), "public"));
  const indexPath = resolve(publicDir, "downloads/official-forms/preview-index.json");
  if (!existsSync(indexPath)) return documents;
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as { schemaVersion: number; documents: Record<string, GeneratedRecord> };
  if (index.schemaVersion !== 1 || !index.documents || typeof index.documents !== "object") throw new Error("Invalid preview index schema");
  const verifiedFile = (value: string, sha: string) => {
    const safe = localArtifact(value);
    if (!safe || !/^[a-f0-9]{64}$/.test(sha || "")) throw new Error("Unsafe or unverified preview index artifact");
    const file = realpathSync(resolve(publicDir, decodeURIComponent(safe).slice(1)));
    if (!file.startsWith(publicDir + sep)) throw new Error("Preview artifact escapes the public directory");
    if (createHash("sha256").update(readFileSync(file)).digest("hex") !== sha) throw new Error(`Stale preview index artifact: ${safe}`);
  };
  const known = new Set(documents.map(item => item.id));
  for (const id of Object.keys(index.documents)) if (!known.has(id)) throw new Error(`Unknown preview index resource: ${id}`);
  return documents.map(item => {
    const entry = index.documents[item.id];
    if (!entry) return item;
    const preview = entry.preview;
    if (!preview || preview.editorialRedraw !== false || !Number.isFinite(preview.width) || !Number.isFinite(preview.height) || preview.width <= 0 || preview.height <= 0)
      throw new Error(`Invalid preview metadata: ${item.id}`);
    if (!item.files.some(file => file.delivery === "hosted" && file.path === preview.sourcePath)) throw new Error(`Unrelated preview source: ${item.id}`);
    verifiedFile(preview.sourcePath, preview.sourceSha256);
    verifiedFile(entry.example, preview.imageSha256);
    verifiedFile(entry.thumbnail, preview.thumbnailSha256);
    if (preview.pdfPath) verifiedFile(preview.pdfPath, preview.pdfSha256 || "");
    if (item.documentSection && (preview.sourcePath !== item.documentSection.sourcePath
      || JSON.stringify(preview.sourcePages) !== JSON.stringify(item.documentSection.pages))) throw new Error(`Stale section preview: ${item.id}`);
    const files = item.documentSection && preview.pdfPath ? [{
      name: `${item.title}.pdf (원본 ${item.documentSection.pages.join("~")}쪽 추출)`,
      path: preview.pdfPath, format: "PDF", role: "extracted", bytes: preview.pdfBytes || 0, delivery: "hosted",
    }, ...item.files] : item.files;
    return { ...item, files, example: entry.example, thumbnail: entry.thumbnail, preview };
  });
}
