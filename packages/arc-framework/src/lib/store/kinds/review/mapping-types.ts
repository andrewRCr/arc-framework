/** Structural input and result contracts for importing repository review facts. */
import type { RecordReference } from "../../identity.js";

/** Imported identity and liveness supplied by the work-item import. */
export type ReviewMappingWorkItem =
  | { slug: string; kind: "work-unit"; uid: string; live: boolean }
  | { slug: string; kind: "errand"; uid: string; live: boolean; claimId: string };

/** Source bytes and imported identities, supplied without filesystem access. */
export interface ReviewMappingInput {
  projectId: string;
  gate: { path: string; bytes: Uint8Array }[];
  candidates: {
    workItem: string;
    versions: { commit: string; content: string }[];
    boundary: string | null;
  }[];
  workItems: ReviewMappingWorkItem[];
}

/** Complete source accounting and oldest-first versions for each mapped record. */
export interface ReviewMappingResult {
  records: { reference: RecordReference; contents: string[] }[];
  listing: {
    source: string;
    outcome: "mapped" | "left-behind" | "in-flight";
    reason?: string;
    records: RecordReference[];
  }[];
}
