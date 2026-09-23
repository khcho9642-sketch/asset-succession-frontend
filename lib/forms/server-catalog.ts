import manifest from "../../public/downloads/official-forms/manifest.json";
import parts from "../../public/downloads/official-forms/document-parts.json";
import sections from "../../public/downloads/official-forms/document-sections.json";
import { expandDocumentParts, expandDocumentSections } from "./document-parts";
import { mergeGeneratedPreviews } from "./preview-index";
import { applyLibraryEditorial } from "./library-editorial";

export const libraryDocuments = applyLibraryEditorial(mergeGeneratedPreviews(expandDocumentParts(expandDocumentSections(manifest.documents, sections), parts)));
