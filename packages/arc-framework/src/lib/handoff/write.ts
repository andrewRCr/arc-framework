/** One anchored metadata write for a session's handoff decisions. */
import { describeRecordConflicts } from "../store/conflict-diagnostics.js";
import type { Store } from "../store/contract.js";
import type { GitExec } from "../git/exec.js";
import { createStoreSyncPort, type StoreSyncPort } from "../store/operational-sync.js";
import { HandoffWriteRequestSchema, type HandoffWriteServiceResult } from "./write-schema.js";
import { resolveCurrentWorkUnit } from "../store/current-work-unit.js";
import { WritePlacementSchema } from "../store/placement.js";
import { writeMetaStateAtHandoff, writeMetaCommitAtHandoff, writeMetaSessionType, writeMetaNextAction,
  writeMetaSessionContext, findMetaSessionContextBoundary } from "../store/kinds/meta/writers.js";
import { reportHandoffTripwires } from "./tripwires.js";
import { isGitObjectId } from "../git/object-id.js";
import { CommitShaSchema } from "../store/links.js";

/** Write one current work unit's handoff and maintain its selected store locally.
 * @param input - Authored request and invocation-scoped runtime ports.
 * @returns A complete refusal or the landed anchors and maintenance report.
 */
export async function runHandoffWrite(input: { cwd: string; request: unknown; store: Store; exec: GitExec; sync?: StoreSyncPort }): Promise<HandoffWriteServiceResult> {
  const { store } = input;
  if (!store.capabilities.stateOffBranch) return refused("unsupported-handoff", "arc handoff write requires a store with stateOffBranch capability.", "Write SESSION-NOTES through the existing handoff workflow.");
  const request = HandoffWriteRequestSchema.safeParse(input.request);
  if (!request.success) return refused("invalid-handoff-request", request.error.message, "Use arc schema get handoff-write-request and repair the request.");
  const boundary = findMetaSessionContextBoundary(request.data.sessionContext);
  if (boundary !== null) return refused("invalid-handoff-request", `Session Context line ${String(boundary.line)} would end the section: ${boundary.text}`,
    "Rewrite that line as contained Session Context prose and retry arc handoff write.");
  const current = await resolveCurrentWorkUnit({ cwd: input.cwd, store });
  if (current.status !== "resolved") return refused("no-current-work-unit", `This checkout does not resolve one current work unit. ${current.warnings.join(" ")}`,
    "Run arc handoff write from the work unit's checkout; resolve any ambiguous checkout claims first.");
  const read = await store.read({ reference: current.candidate.reference });
  if (read.status === "refused") return read;
  const meta = read.result;
  if (meta.conflicts.length > 0) return refused("work-unit-unreadable", `The current work unit's meta has unresolved conflicts.${describeRecordConflicts(meta.conflicts)}`, "Resolve its meta conflicts and retry arc handoff write.");
  const version = await store.version();
  if (version.status === "refused") return version;
  const head = await readHead(input);
  if (head === null) return refused("git-head-unresolved", "The checkout's HEAD could not be resolved.", "Repair HEAD in the work unit's checkout and retry arc handoff write.");
  let content = writeMetaSessionContext(meta.content, request.data.sessionContext);
  content = writeMetaNextAction(content, request.data.nextAction);
  content = writeMetaSessionType(content, request.data.sessionType ?? null);
  content = writeMetaStateAtHandoff(content, version.result);
  content = writeMetaCommitAtHandoff(content, head);
  const write = await store.write({ action: "put", reference: meta.reference, expected: meta.version, content,
    placement: WritePlacementSchema.parse(meta.placement), provenance: { verb: "handoff-write", lifecycleAction: "handoff", codeHead: CommitShaSchema.parse(head) } });
  if (write.status === "refused") return write;
  const maintained = await maintainAfterWrite(input.sync ?? createStoreSyncPort());
  return { status: "written", reference: write.result.reference, stateAtHandoff: version.result,
    commitAtHandoff: head, ...maintained };
}
function refused(code: "invalid-handoff-request" | "no-current-work-unit" | "git-head-unresolved" | "unsupported-handoff" | "work-unit-unreadable", condition: string, text: string): HandoffWriteServiceResult {
  return { status: "refused", refusal: { code, class: "recoverable", condition, remedy: { text } } };
}
async function readHead(input: { cwd: string; exec: GitExec }): Promise<string | null> {
  try {
    const head = (await input.exec("git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: input.cwd })).stdout.trim();
    return isGitObjectId(head) ? head : null;
  } catch { return null; }
}
async function maintainAfterWrite(sync: StoreSyncPort) {
  try { return { maintenance: reportHandoffTripwires({ maintenance: await sync.maintain() }), diagnostics: [] }; }
  catch (error) { return { maintenance: reportHandoffTripwires({}), diagnostics: [`Handoff landed; local maintenance failed: ${error instanceof Error ? error.message : String(error)}`] }; }
}
