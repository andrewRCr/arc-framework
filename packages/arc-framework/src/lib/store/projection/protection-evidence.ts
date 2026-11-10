/** Shared source and checkout observations used only by a rendering round. */
import { createCheckoutObservation, type CheckoutObservation } from "../../locus/checkout-observation.js";
import type { GitExec } from "../../git/exec.js";
import { createProjectIdentityReader } from "../project-identity.js";
import type { ProjectionSource } from "./record-source.js";

/** Source reads and raw native evidence shared by every destination in a round. */
export interface ProjectionProtectionEvidence {
  readonly source: Pick<ProjectionSource, "read" | "list">;
  readonly checkouts: CheckoutObservation;
  readonly projectId: () => Promise<string>;
}

/** Bind lazy native observations and source-owned identity reads; the caller supplies its round's read memo. */
export function createProjectionProtectionEvidence(input: {
  source: Pick<ProjectionSource, "read" | "list">; checkout: string; exec: GitExec; checkouts?: CheckoutObservation;
}): ProjectionProtectionEvidence {
  const exec: GitExec = (command, args, options) => input.exec(command, args, { cwd: input.checkout, ...options });
  return { source: input.source, checkouts: input.checkouts ?? createCheckoutObservation(exec),
    projectId: createProjectIdentityReader(input.source) };
}
