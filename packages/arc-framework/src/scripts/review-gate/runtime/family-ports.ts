/** Select invocation-bound durable review ports while retaining repository adapters. */
import type { GitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { createProjectIdentityReader } from "../../../lib/store/project-identity.js";
import { NativeReviewInFlightStateStore } from "../hosts/local/in-flight-state-store.js";
import type { Store } from "../../../lib/store/contract.js";
import type { OwnerIdentity } from "../../../lib/store/identity.js";
import type { ApprovedDispositionRecordIndex, ApprovedDispositionRecordStore, ReviewInFlightPort,
  ReviewOutcomePort, ReviewEvidencePort, ReviewDecisionPort } from "../core/ports.js";
import { createReviewOutcomePort } from "../../../lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../lib/store/kinds/review/evidence/access.js";
import { createReviewDecisionPort } from "../../../lib/store/kinds/review/decision/access.js";
import { requireReviewWorkItem } from "../../../lib/store/kinds/review/access-shared.js";

/** Compatibility adapters already opened by the invocation. */
export interface RepositoryReviewFamilyPorts {
  inFlight: ReviewInFlightPort;
  dispositions: ApprovedDispositionRecordStore & ApprovedDispositionRecordIndex;
}

/** Portable record access and the invocation's separately selected working-state adapter. */
export interface StoredReviewFamilyPorts {
  inFlight: ReviewInFlightPort;
  outcomes: ReviewOutcomePort;
  evidence: ReviewEvidencePort;
  decisions: ReviewDecisionPort;
  dispositions: ReviewEvidencePort;
}

/** Select one backend arm without opening a second store or choosing another work item. */
export function bindReviewFamilyPorts<T extends RepositoryReviewFamilyPorts>(input: {
  store?: Store; owner?: OwnerIdentity; publisher: GitCommonStatePublisher; projectId?: () => Promise<string>; repository: T;
}): { mode: "in-repo"; ports: T } | { mode: "stored"; ports: StoredReviewFamilyPorts } {
  if (input.store?.capabilities.stateOffBranch !== true) return { mode: "in-repo", ports: input.repository };
  const owner = requireReviewWorkItem(input.owner, "Binding stored review ports");
  const evidence = createReviewEvidencePort(input.store, owner);
  const outcomes = createReviewOutcomePort(input.store, owner);
  const decisions = createReviewDecisionPort(input.store, owner);
  const inFlight = new NativeReviewInFlightStateStore({ publisher: input.publisher, workItem: owner,
    outcomes, evidence, decisions, projectId: input.projectId ?? createProjectIdentityReader(input.store) });
  return { mode: "stored", ports: { inFlight, outcomes, evidence, decisions, dispositions: evidence } };
}
