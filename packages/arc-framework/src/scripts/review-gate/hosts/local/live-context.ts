/** Live ARC vehicle and work-unit metadata resolution for local review. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ReviewOwnerSelectionError } from "../../../../lib/store/kinds/review/errors.js";
import { sameOwner, type OwnerIdentity } from "../../../../lib/store/identity.js";
import type { GitExec } from "../../../../lib/git/exec.js";
import { readReviewWorkUnitByRef } from "../../../../lib/store/review-work-unit.js";
import type { ReviewInvocationInput } from "../../runtime/invocation.js";
import {
  readActiveMetaCandidates,
  parseMetaRecord,
  toMetaRecord,
  type MetaRecord,
} from "../../../../lib/active/meta-reader.js";
import {
  projectTransientInFlightRead,
  readTransientInFlightIndexes,
} from "../../../../lib/errand/record.js";
import { resolveIdentity } from "../../../../lib/git/identity.js";
import { readReviewCheckoutErrandSelection, type ReviewCheckoutErrand } from "./review-errand.js";
import type { LocalReviewLiveContext } from "./review-authority.js";
import { rethrowNativeRefusal } from "../../../../lib/store/native-refusal.js";

export interface ResolvedLocalReviewLiveContext {
  context: LocalReviewLiveContext;
  meta: MetaRecord | null;
  /** Exact native primary selected by the branch link or checkout claim. */
  workItem?: OwnerIdentity;
  /** Exact native claim retained for consumers with a narrower lifecycle filter. */
  errandRecord?: ReviewCheckoutErrand;
}

/** Corroborate a current-checkout binding by generation and retain the selected owner's current name. */
export function corroborateLocalReviewOwner(bound: OwnerIdentity | undefined, live: ResolvedLocalReviewLiveContext): OwnerIdentity | undefined {
  if (bound !== undefined && (live.workItem === undefined || !sameOwner(bound, live.workItem))) {
    throw Object.assign(new Error("The bound review work item does not match the current checkout owner. Re-enter from the owning checkout and retry."),
      { code: "invalid-input" });
  }
  return live.workItem;
}

/**
 * The named Errand claim when the checkout's live Errand holds it, or null when none here does. A native store,
 * project-identity, or owner refusal is raised rather than read as no claim.
 */
export async function readLiveErrandClaimId(input: ReviewInvocationInput, claimId: string): Promise<string | null> {
  const live = await readLocalReviewLiveContext(input).catch((error: unknown) => { rethrowNativeRefusal(error); return null; });
  return live?.context.errand?.claimId === claimId ? claimId : null;
}

/** Resolve the current branch to exactly one WU meta or Errand identity record. */
export async function readLocalReviewLiveContext(input: ReviewInvocationInput): Promise<ResolvedLocalReviewLiveContext> {
  const exec: GitExec = (command, args, options) => input.exec(command, args, { ...options, cwd: input.cwd });
  const activeIdentity = await resolveIdentity({ exec });
  const branch = (await input.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: input.cwd,
  })).stdout.trim();
  if (input.store?.capabilities.stateOffBranch === true) {
    return readStoredLiveContext({ ...input, store: input.store }, activeIdentity, branch);
  }
  const active = await readActiveMetaCandidates(input.cwd);
  const matching = active.candidates.filter((candidate) => candidate.branch === branch);
  if (matching.length > 1) throw new ReviewOwnerSelectionError("corrupt-state",
    `multiple active work units match the current branch (${branch}).`,
    { text: "Correct the competing work-unit Branch fields so exactly one work unit owns this branch, then retry." });
  if (matching.length === 1) {
    const candidate = matching[0];
    if (candidate === undefined) throw new Error("active work unit disappeared");
    const meta = toMetaRecord(parseMetaRecord(await readFile(join(input.cwd, candidate.path), "utf8")));
    if (meta === null) throw new ReviewOwnerSelectionError("corrupt-state",
      `active work-unit metadata is incomplete (${candidate.path}).`,
      { text: "Complete the required fields in that meta file, then retry from its owning checkout." });
    const identity = candidate.filename.replace(/^meta-/u, "").replace(/\.md$/u, "");
    return {
      context: {
        activeIdentity,
        workUnit: {
          identity,
          owner: meta.owner,
        },
        errand: null,
      },
      meta,
    };
  }
  const transient = projectTransientInFlightRead(
    await readTransientInFlightIndexes({ exec, identity: activeIdentity }),
  );
  if (!transient.complete) throw new ReviewOwnerSelectionError("corrupt-state",
    transient.degraded ?? "Transient identity is incomplete.",
    { text: `Repair the transient identity ref for ${activeIdentity ?? "the active identity"} `
      + "and restore its complete valid identity records, then retry." });
  const claims = transient.indexes.records.filter((record) => record.branch === branch);
  // Strict identity keys and branch derivation currently prevent competing valid records.
  if (claims.length > 1) throw new ReviewOwnerSelectionError("corrupt-state",
    "Multiple transient identities claim the local review branch.",
    { text: "Resolve the competing transient claims so exactly one identity owns this branch, then retry." });
  const errand = claims[0];
  const activeErrand = errand !== undefined && (errand.state === "open" || errand.state === "awaiting-merge")
    ? errand
    : null;
  return {
    context: {
      activeIdentity,
      workUnit: null,
      errand: activeErrand === null ? null : { identity: activeErrand.slug, claimId: activeErrand.claimId },
    },
    meta: null,
  };
}

async function readStoredLiveContext(input: ReviewInvocationInput & { store: NonNullable<ReviewInvocationInput["store"]> },
  activeIdentity: string | null, branch: string): Promise<ResolvedLocalReviewLiveContext> {
  const selected = await readReviewWorkUnitByRef({ cwd: input.cwd, store: input.store, projectId: input.projectId }, branch);
  if (selected !== null) return { context: { activeIdentity,
    workUnit: { identity: selected.name, owner: selected.meta.owner }, errand: null }, meta: selected.meta, workItem: selected.record.reference.owner };
  const selection = await readReviewCheckoutErrandSelection({ cwd: input.cwd, store: input.store });
  const record = selection?.record ?? null;
  const activeErrand = record !== null && record.branch === branch
    && (record.state === "open" || record.state === "awaiting-merge") ? record : null;
  return { context: { activeIdentity, workUnit: null,
    errand: activeErrand === null ? null : { identity: activeErrand.slug, claimId: activeErrand.claimId } }, meta: null,
    ...(activeErrand === null ? {} : { errandRecord: activeErrand, workItem: selection?.workItem }) };
}
