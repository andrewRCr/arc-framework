/** Quiescence admission and restore-point acquisition for an explicitly named importing checkout. */
import type { WindowRequest } from "./main.js";
import { WindowRefusal, type WindowResult } from "./result.js";
import { readWindowPreconditions, windowPreexistingStoreRefFindings } from "./preflight.js";
import { parseWindowFlipInput } from "./input.js";
import { readWindowHostFacts, type WindowHostPort } from "./host.js";
import { readSuppliedWindowRequests } from "./supplied.js";
import { createWindowHost } from "./native-host.js";
import { captureWindowState } from "./capture.js";
import { windowCheckoutLockFindings } from "./lock.js";
import { readWindowCheckoutStatusFindings, readWindowCheckoutUpstreamFindings, readWindowIgnoredStateFindings,
  windowPersonalLinkFindings } from "./checkout-cleanliness.js";
import { acquireWindowOriginRefs, writeWindowHold, discardUnfinishedWindowHold, type WindowHoldStepHook } from "./hold.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { readWindowStashFindings } from "./stashes.js";
import { windowUnmarkedCheckoutFindings, readWindowEndedCheckoutFindings, windowErrandHolderFindings } from "./checkout-holders.js";
import { readWindowDecompositionBranchFindings, readWindowDecompositionDirectoryFindings } from "./decomposition.js";
import { readWindowSealAnchor, readWindowCheckoutAncestryFindings, readWindowBuildFindings } from "./seals.js";
import { readWindowExecutableFindings } from "./executables.js";
import { readWindowTrackedRecordFindings } from "./tracked-records.js";
import { readWindowDivergingCopyFindings } from "./diverging-copies.js";
import { readWindowFlipAncestryFindings } from "./flip-ancestry.js";
import { windowPullRequestFindings, windowMergeSettingFindings } from "./pull-requests.js";

/** External host boundary and named write checkpoints, replaceable in native scenarios. */
export interface WindowCheckOptions { host?: WindowHostPort; step?: WindowHoldStepHook }

/** Refuse pre-existing state before acquiring the record and its completion marker. */
export async function checkWindow(request: WindowRequest, options: WindowCheckOptions = {}): Promise<WindowResult> {
  const input = parseWindowFlipInput(request.args);
  const findings = await readWindowPreconditions(request.repo);
  if (findings.length > 0) return { operation: "check", status: "refused", findings };
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo });
  const io = { repo: request.repo, exec: ports.exec, execInput: ports.execInput };
  const host = options.host ?? createWindowHost(io);
  const facts = await readWindowHostFacts({ exec: io.exec, host }, input.pullRequest, {
    ...input.anchor !== undefined ? { anchor: input.anchor } : {},
    ...input.listing !== undefined ? { pullRequests: () => readSuppliedWindowRequests(request.repo, input.listing ?? "", input.pullRequest) } : {},
  });
  if (facts.pullRequests.flip.headBranch !== input.branch || facts.pullRequests.flip.baseBranch !== "main") {
    throw new WindowRefusal([{ subject: "flip pull request",
      condition: `Pull request #${input.pullRequest} names ${facts.pullRequests.flip.headBranch} into ${facts.pullRequests.flip.baseBranch}, not ${input.branch} into main.`,
      remedy: "Name the matching flip branch and main-targeting pull request, or repair the request target, then retry." }]);
  }
  const origin = await host.refs(["refs/arc/*"]);
  const originFindings = windowPreexistingStoreRefFindings(new Map(Object.entries(origin)), "origin");
  if (originFindings.length > 0) return { operation: "check", status: "refused", findings: originFindings };
  try {
    await acquireWindowOriginRefs(io, origin);
    const state = await captureWindowState(io, input, origin);
    const anchor = await readWindowSealAnchor(io, facts.anchor);
    const checkoutFindings = [...windowUnmarkedCheckoutFindings(state.checkouts), ...await readWindowEndedCheckoutFindings(io, state.checkouts),
      ...windowErrandHolderFindings(state.checkouts, state.live.transients),
      ...windowCheckoutLockFindings(state.checkouts), ...await readWindowCheckoutStatusFindings(io, state.checkouts),
      ...await readWindowCheckoutUpstreamFindings(io, state.checkouts), ...await readWindowIgnoredStateFindings(io, state.checkouts),
      ...windowPersonalLinkFindings(state.checkouts, state.personal.disk.links), ...await readWindowStashFindings(io),
      ...await readWindowDecompositionBranchFindings(io, state.record.branches), ...await readWindowDecompositionDirectoryFindings(request.repo),
      ...await readWindowCheckoutAncestryFindings(io, state.checkouts, anchor), ...await readWindowBuildFindings(state.checkouts),
      ...await readWindowExecutableFindings(state.checkouts, input.path),
      ...await readWindowTrackedRecordFindings(state.context, state.record, state.live.composition),
      ...await readWindowDivergingCopyFindings(state.context, state.record.branches.local.main, state.live.composition),
      ...await readWindowFlipAncestryFindings(io, state.record),
      ...windowPullRequestFindings(facts.pullRequests, Object.keys(state.record.branches.live), state.record.flip.branch),
      ...facts.hosted ? windowMergeSettingFindings(await host.mergeSettings()) : []];
    if (checkoutFindings.length > 0) throw new WindowRefusal(checkoutFindings);
    const tip = await writeWindowHold(io, state.record, options.step);
    return { operation: "check", status: "passed", findings: [], data: { tip } };
  } catch (error) {
    if (error instanceof WindowRefusal) await discardUnfinishedWindowHold(io);
    throw error;
  }
}
