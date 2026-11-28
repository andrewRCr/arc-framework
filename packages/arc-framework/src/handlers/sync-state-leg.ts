/** The store's leg of `arc sync`: pull, settle a remote's designation, then publish state first and alone. */
import { stripVTControlCharacters } from "node:util";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { reportHandoffTripwires, type HandoffTripwireReport } from "../lib/handoff/tripwires.js";
import type { Store } from "../lib/store/contract.js";
import type { PullResult } from "../lib/store/operational-sync.js";
import { projectPull, pullSelectedStore } from "../lib/store/operational-sync-bindings.js";
import { consumePull, pullDesignation, pullOutcomeNotices, renderExplained } from "../lib/store/pull-consumption.js";
import type { StoreRefusal, StoreResult } from "../lib/store/refusal.js";
import type { PushResult } from "../lib/store/sync.js";
import type { SyncOutput } from "../lib/sync-output.js";
import { syncStoreDesignationSite } from "../prompts/sync-store-designation.js";
import { offerStoreDesignation, type StoreDesignationPorts } from "./store-designation.js";
import type { LegOutcomeRecord } from "./sync.js";

/** The state leg's pull and push, reported in place of the notes leg. */
export interface StateLegOutcome { readonly pull: LegOutcomeRecord; readonly push: LegOutcomeRecord }

/** The leg's records, whether it failed, and the push's figures over their bounds, when any are. */
export interface StateLegResult {
  readonly state: StateLegOutcome;
  readonly failed: boolean;
  readonly tripwires?: HandoffTripwireReport;
}

type StatePushRecord = LegOutcomeRecord & { result: Exclude<LegOutcomeRecord["result"], "cancelled"> };

/** Pull and consume the store, ask for or report a remote's designation, then push and report the push's figures.
 * A stopping pull, a designation left unmade, or a failed push publishes no state, or none further, and fails the leg.
 */
export async function runStateLeg(input: { readonly store: Store; readonly cwd: string; readonly context: InteractionContext;
  readonly output: SyncOutput }, ports: StoreDesignationPorts = {}): Promise<StateLegResult> {
  const { output } = input;
  let pulled: PullResult;
  try {
    pulled = await pullSelectedStore(input.store);
  } catch (error) {
    return unpushed(operationError("pull", error, output), "pull-stopped");
  }
  const consumed = consumePull(pulled);
  const designation = pullDesignation(pulled);
  // A pull that proceeds reaches the designation below, which asks the question or reports it with its remedy.
  const stopping = consumed.kind === "stop";
  for (const notice of consumed.notices) if (stopping || notice !== consumed.designationNotice) output.log.warn(notice);
  if (consumed.kind === "stop") {
    output.log.error(`State pull stopped: ${consumed.reason}`);
    return unpushed({ action: "pull", result: "failed", detail: consumed.reason }, "pull-stopped");
  }
  const pull = pullRecord(pulled);
  if (designation !== undefined) {
    const offered = await offerStoreDesignation(syncStoreDesignationSite, designation, input.cwd, input.context, ports);
    if (offered.status !== "designated") {
      const remedy = renderExplained([`Remote ${designation.remote} needs a store designation; no state was published.`], designation.remedy);
      output.log.error(offered.status === "failed" ? `${offered.argv.join(" ")} ${offered.reason}. ${remedy}` : remedy);
      return unpushed(pull, "designation-needed");
    }
  }
  return publish(input.store, pull, output);
}

async function publish(store: Store, pull: LegOutcomeRecord, output: SyncOutput): Promise<StateLegResult> {
  let pushed: StoreResult<PushResult>;
  try {
    pushed = await store.push();
  } catch (error) {
    return { state: { pull, push: operationError("push", error, output) }, failed: true };
  }
  if (pushed.status === "ok") for (const notice of pullOutcomeNotices(pushed.result.pulls)) output.log.warn(notice);
  const push = pushRecord(pushed);
  const failed = push.result === "failed" || push.result === "blocked";
  switch (push.result) {
    case "failed": case "blocked": output.log.error(`State push ${push.result}: ${push.detail}`); break;
    case "skipped": output.log.info("State push skipped because no state push remote is designated."); break;
    case "success": output.log.info("State pushed."); break;
    case "noop": output.log.info("State already current on its remote."); break;
  }
  const tripwires = pushed.status === "ok" ? contention(pushed.result) : undefined;
  if (tripwires?.contention) output.log.warn(tripwires.contention.text);
  return { state: { pull, push }, failed, ...(tripwires === undefined ? {} : { tripwires }) };
}

function operationError(action: "pull" | "push", error: unknown, output: SyncOutput): LegOutcomeRecord {
  const message = error instanceof Error ? error.message : String(error);
  const detail = `${message} Resolve the reported store error, then retry with arc sync.`;
  output.log.error(`State ${action} failed: ${detail}`);
  return { action, result: "failed", detail };
}

function unpushed(pull: LegOutcomeRecord, reason: string): StateLegResult {
  return { state: { pull, push: { action: "push", result: "blocked", detail: reason } }, failed: true };
}

function pullRecord(result: PullResult): LegOutcomeRecord {
  if (result.status === "pulled") return { action: "pull", result: "success" };
  if (result.status === "designation-needed") return { action: "pull", result: "blocked", detail: "designation-needed" };
  if (result.status === "unreachable" || result.status === "incomplete") return { action: "pull", result: "success", detail: "read-source-failed" };
  return { action: "pull", result: "noop", ...(result.status === "noop" ? {} : { detail: result.status }) };
}

function pushRecord(result: StoreResult<PushResult>): StatePushRecord {
  if (result.status === "refused") return failedPush(result.refusal);
  const stopped = stoppedPushRecord(result.result);
  if (stopped !== undefined) return stopped;
  for (const publish of result.result.publishes) {
    if (publish.status === "failed") return failedPush(publish.failure);
    // A conflict, a block, or a history condition explains itself; a published or current family does not.
    if ("condition" in publish) return { action: "push", result: "failed", detail: `${publish.condition} ${publish.remedy.text}` };
  }
  return result.result.publishes.some(publish => publish.status === "pushed" || publish.status === "reconciled")
    ? { action: "push", result: "success" } : { action: "push", result: "noop" };
}

function stoppedPushRecord(result: PushResult): StatePushRecord | undefined {
  // Publication can stop while discovering its destination or pulling the basis for the push.
  const observed = projectPull(result);
  const designation = pullDesignation(observed);
  if (designation !== undefined) {
    return { action: "push", result: "blocked",
      detail: renderExplained([`Remote ${designation.remote} needs a store designation.`], designation.remedy) };
  }
  if ((observed.status === "unreachable" || observed.status === "incomplete") && consumePull(observed).kind === "stop") {
    return { action: "push", result: "failed", detail: renderExplained([observed.condition], observed.remedy) };
  }
  if (result.states.some(state => state.status === "no-remote")) {
    return { action: "push", result: "skipped", detail: "no-remote" };
  }
  return undefined;
}

function failedPush(failure: StoreRefusal): StatePushRecord {
  const parts = [failure.condition];
  if ("message" in failure && failure.message !== failure.condition) parts.push(failure.message);
  const detail = stripVTControlCharacters(renderExplained(parts, failure.remedy)).replace(/(?![\n\t])\p{Cc}/gu, "");
  return { action: "push", result: "failed", detail };
}

/** The contention report over the push's largest retry count and wait, or nothing when no figure exceeds its bound. */
function contention(result: PushResult): HandoffTripwireReport | undefined {
  const measured = result.publishes.flatMap(publish => "retryCount" in publish ? [publish] : []);
  if (measured.length === 0) return undefined;
  const report = reportHandoffTripwires({ push: { retryCount: Math.max(...measured.map(publish => publish.retryCount)),
    waitedMs: Math.max(...measured.map(publish => publish.waitedMs)) } });
  return report.contention === null ? undefined : report;
}
