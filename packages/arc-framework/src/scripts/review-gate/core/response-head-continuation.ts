/** Ephemeral repository proof for a performed fix followed by its required Candidate record commit. */

import type { CanonicalDigest } from "../../../lib/kernel/index.js";
import type { LaneSubjectLineage } from "./lane-admission.js";

export interface ResponseHeadContinuationInput {
  repositoryId: string;
  lineage: LaneSubjectLineage;
  producerId: string;
  dispositionSetId: CanonicalDigest;
  originatingHeadSha: string;
  fromHeadSha: string;
  toHeadSha: string;
}

export type ConfirmResponseHeadContinuation = (input: ResponseHeadContinuationInput) => Promise<boolean>;
