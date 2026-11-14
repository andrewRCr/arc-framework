/** Capture the importing repository's coordinates and acquired source digests for the window record. */
import { readWindowImportPlacementFindings } from "./off-host.js";
import { listWindowRefs, type WindowGitReadIO } from "./git.js";
import type { WindowRecord } from "./hold.js";
import type { WindowFlipInput } from "./input.js";
import { WindowRefusal, type WindowFinding } from "./result.js";
import { readWindowCheckouts, type WindowCheckout } from "./checkouts.js";
import { createWindowImportContext, type WindowImportContext } from "./import-context.js";
import { readWindowLiveState, type WindowLiveState } from "./live-state.js";
import { readWindowPersonalState, readWindowReviewDigest, type WindowPersonalState } from "./digests.js";

/** Complete origin observations acquired before the restore record is assembled. */
export interface WindowOriginInputs { refs: Readonly<Record<string, string>>; branches: Readonly<Record<string, string>> }

/** One source acquisition retained for admission alongside its serializable restore record. */
export interface WindowCapturedState {
  record: WindowRecord; checkouts: WindowCheckout[]; personal: WindowPersonalState; live: WindowLiveState; context: WindowImportContext;
  /** Inputs that could not be read completely; the check reports them beside every other condition and records nothing. */
  findings: WindowFinding[];
}

function select(refs: ReadonlyMap<string, string>, prefix: string, branches = false): Record<string, string> {
  return Object.fromEntries<string>([...refs].filter(([ref]) => ref.startsWith(prefix) && ref !== "refs/remotes/origin/HEAD")
    .map(([ref, tip]): [string, string] => [branches ? ref.slice(prefix.length) : ref, tip]));
}

/** Read every registered checkout, local/fetched branch, and local/tracking ARC ref without moving any ref. */
export async function captureWindowState(io: WindowGitReadIO, input: WindowFlipInput,
  origin: WindowOriginInputs): Promise<WindowCapturedState> {
  const [refs, checkouts, context] = await Promise.all([
    listWindowRefs(io, ["refs/heads/", "refs/remotes/origin/", "refs/arc/", "refs/arc-remotes/origin/"]),
    readWindowCheckouts(io), createWindowImportContext(io.repo),
  ]);
  const placement = await readWindowImportPlacementFindings(io.repo, checkouts);
  if (placement.length > 0) throw new WindowRefusal(placement);
  const local = select(refs, "refs/heads/", true); const fetched = select(refs, "refs/remotes/origin/", true);
  const head = local[input.branch] ?? fetched[input.branch];
  if (head === undefined) throw new WindowRefusal([{ subject: input.branch, condition: "The named flip branch cannot be resolved.",
    remedy: "Fetch or restore the intended flip branch, then retry check." }]);
  const [live, personal, review] = await Promise.all([
    readWindowLiveState(context, checkouts, { local, origin: fetched }),
    readWindowPersonalState(context, checkouts), readReviewDigest(context),
  ]);
  const reviewGateDigest = review.digest;
  const flip = live.branches[input.branch];
  live.branches[input.branch] = { local: local[input.branch] ?? null, origin: fetched[input.branch] ?? null,
    reasons: [...flip?.reasons ?? [], "Window flip"] };
  const host = Object.fromEntries<string | null>([...new Set(["main", ...Object.keys(live.branches)])]
    .map((branch): [string, string | null] => [branch, origin.branches[`refs/heads/${branch}`] ?? null]));
  const worktrees = checkouts.map(({ path, head, branch }) => {
    const personalDigest = personal.digests[path];
    if (personalDigest === undefined) throw new Error(`No acquired personal digest for checkout ${path}`);
    return { path, head, branch, personalDigest };
  });
  return { checkouts, personal, live, context, findings: [...live.findings, ...review.findings],
    record: { version: 1, flip: { branch: input.branch, pullRequest: input.pullRequest, head }, worktrees, reviewGateDigest,
      branches: { local, origin: fetched, host, live: live.branches }, refs: { local: select(refs, "refs/arc/"), origin: { ...origin.refs },
        tracking: select(refs, "refs/arc-remotes/origin/") } } };
}

async function readReviewDigest(context: WindowImportContext): Promise<{ digest: string; findings: WindowFinding[] }> {
  try {
    return { digest: await readWindowReviewDigest(context), findings: [] };
  } catch (error) {
    if (error instanceof WindowRefusal) return { digest: "", findings: [...error.findings] };
    throw error;
  }
}
