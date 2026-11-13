/** Admission and named mutation boundaries for restoring a cutover window before its flip merges. */
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { WindowRefusal } from "./result.js";
import { isWindowFlipMerged } from "./merged-flip.js";
import { createWindowHost } from "./native-host.js";
import { readSuppliedWindowRequests } from "./supplied.js";
import type { WindowRequest } from "./main.js";
import { readWindowHostFacts, type WindowHostFacts, type WindowHostPort } from "./host.js";
import { readWindowHold, type WindowHoldIO, type WindowRecord } from "./hold.js";
import { parseWindowFlipInput, type WindowFlipInput } from "./input.js";

/** Before-write and before-merge-test checkpoints for observing an interrupted restore. */
export type WindowRestoreStep = "restore.compare-record" | "restore.origin" | "restore.local" | "restore.configuration"
  | "restore.verify" | "restore.hold" | "restore.merged.initial" | "restore.merged.push" | "restore.merged.registry";
/** Optional host boundary and named checkpoints; the source entry supplies native defaults. */
export interface WindowRestoreOptions { host?: WindowHostPort; step?: (step: WindowRestoreStep) => Promise<void> }
/** Admitted restore authority and dependencies, bound to one explicit checkout and complete hold. */
export interface WindowRestoreContext {
  io: WindowHoldIO; host: WindowHostPort; facts: WindowHostFacts; input: WindowFlipInput;
  record: WindowRecord; tip: string; step?: WindowRestoreOptions["step"];
}

/** Read a complete hold and establish that restoring it is still permitted. */
export async function admitWindowRestore(request: WindowRequest, options: WindowRestoreOptions = {}): Promise<WindowRestoreContext> {
  const input = parseWindowFlipInput(request.args, "restore");
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo });
  const io = { repo: request.repo, exec: ports.exec, execInput: ports.execInput };
  const { record, tip } = await readWindowHold(io);
  if (input.branch !== record.flip.branch || input.pullRequest !== record.flip.pullRequest) throw new WindowRefusal([{ subject: "flip identity",
    condition: `The hold names ${record.flip.branch} and request #${record.flip.pullRequest}, not ${input.branch} and #${input.pullRequest}.`,
    remedy: "Name the flip branch and pull request recorded in the hold, then retry restore." }]);
  const host = options.host ?? createWindowHost(io);
  const listing = input.listing;
  const facts = await readWindowHostFacts({ exec: io.exec, host }, input.pullRequest,
    listing === undefined ? {} : { pullRequests: () => readSuppliedWindowRequests(request.repo, listing, input.pullRequest) });
  if (facts.pullRequests.flip.headBranch !== record.flip.branch || facts.pullRequests.flip.baseBranch !== "main") {
    throw new WindowRefusal([{ subject: "flip pull request",
      condition: `Request #${record.flip.pullRequest} now names ${facts.pullRequests.flip.headBranch} into ${facts.pullRequests.flip.baseBranch}, not the recorded flip into main.`,
      remedy: "Repair the flip request to identify its recorded branch into main, then retry restore." }]);
  }
  if (facts.pullRequests.flip.autoMergeArmed) throw new WindowRefusal([{ subject: "flip pull request",
    condition: "Auto-merge is armed on the flip request; it could merge while the window restores.",
    remedy: "Disarm auto-merge on the flip request, then retry restore." }]);
  const context: WindowRestoreContext = { io, record, tip, host, facts, input, ...options.step ? { step: options.step } : {} };
  await requireWindowRestoreUnmerged(context, "restore.merged.initial");
  return context;
}

/** Re-read strict merge evidence at each boundary that must preserve the local store if the flip landed. */
export async function requireWindowRestoreUnmerged(context: WindowRestoreContext,
  checkpoint: Extract<WindowRestoreStep, `restore.merged.${string}`>): Promise<void> {
  await context.step?.(checkpoint);
  if (await isWindowFlipMerged({ ...context.io, host: context.host, hosted: context.facts.hosted }, context.record.flip.head)) {
    throw new WindowRefusal([{ subject: "merged flip", condition: "The recorded flip has merged into origin/main; the window cannot restore it.",
      remedy: "Fix forward from the landed store and preserve the hold for diagnosis." }]);
  }
}
