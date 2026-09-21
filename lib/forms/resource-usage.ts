import content from "./resource-usage.json";

export type ResourceUsage = {
  who: string;
  when: string;
  prepare: string[];
  steps: string[];
  note: string;
  timingRationale: string;
  sourceUrls: string[];
};

const documents: Record<string, ResourceUsage> = content.documents;
export const getResourceUsage = (id: string): ResourceUsage | undefined => documents[id];
