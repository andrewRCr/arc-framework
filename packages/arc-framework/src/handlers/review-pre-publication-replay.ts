/** Select pre-publication replay codecs and preserve only the selected backend's call inputs. */
import { canonicalize, type CanonicalDigest } from "../lib/kernel/index.js";
import type { ReviewTarget } from "../scripts/review-gate/core/gate-contract-v2-schema.js";
import { PrePublicationLaneJudgmentsSchema, consumeFrontlineCeilingOverride } from "../scripts/review-gate/policy/pre-publication-request.js";
import { decodePrePublicationReplay, encodePrePublicationReplay, type PrePublicationReplayInput,
  type PrePublicationReplayInputV2 } from "../scripts/review-gate/policy/pre-publication-replay.js";

/** The caller's parsed judgment inputs, each absent unless its option named a source. */
export interface ReviewPrePublicationJudgment {
  selfReview: "settled" | undefined;
  changeSet: unknown;
  lanes: unknown;
  frontlineCeilingHeadSha: string | undefined;
}

interface CallInput {
  resume?: string;
  selfReview?: "settled";
  changeSet?: string;
  lanes?: string;
}

/** The handler dependencies reading a call needs: its root, its caller-supplied sources, and the selected backend. */
interface ReplayAccess {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  boundarySchemaVersion?(root: string): 1 | 2;
}

function replayJudgment(replay: PrePublicationReplayInput): ReviewPrePublicationJudgment {
  return { selfReview: replay.selfReview, changeSet: replay.changeSet, lanes: replay.lanes,
    frontlineCeilingHeadSha: replay.frontlineCeilingHeadSha };
}

/** Read caller sources and the selected strict replay contract with the existing request/execution error boundary. */
export async function readPrePublicationCall(input: CallInput, access: ReplayAccess): Promise<
  | { status: "ready"; root: string; schemaVersion: 1 | 2; replay: PrePublicationReplayInput | null; judgment: ReviewPrePublicationJudgment }
  | { status: "failed"; error: unknown; stage: "request" | "execution" }
> {
  let replay: PrePublicationReplayInput | null;
  let judgment: ReviewPrePublicationJudgment;
  try {
    replay = input.resume === undefined ? null : decodePrePublicationReplay(input.resume);
    const read = async (source: string | undefined): Promise<unknown> =>
      source === undefined ? undefined : JSON.parse(await access.readText(source));
    judgment = replay === null ? { selfReview: input.selfReview, changeSet: await read(input.changeSet),
      lanes: await read(input.lanes), frontlineCeilingHeadSha: undefined } : replayJudgment(replay);
  } catch (error) { return { status: "failed", error, stage: "request" }; }
  let root: string;
  let schemaVersion: 1 | 2;
  try {
    const resolved = access.resolveRoot(process.cwd());
    if (resolved === null) throw new Error("Not inside an ARC project.");
    root = resolved;
    schemaVersion = access.boundarySchemaVersion?.(root) ?? 1;
  } catch (error) { return { status: "failed", error, stage: "execution" }; }
  try {
    if (input.resume !== undefined && schemaVersion === 2) {
      replay = decodePrePublicationReplay(input.resume, 2);
      judgment = replayJudgment(replay);
    }
    return { status: "ready", root, schemaVersion, replay, judgment };
  } catch (error) { return { status: "failed", error, stage: "request" }; }
}

/**
 * Whether a saved scope judgment still binds this call: its target is one the call examined. A singleton call examines
 * its one target; a delivery call examines each member its selection passed through.
 */
export function scopeJudgmentTargetExamined(examined: readonly (ReviewTarget | null)[], saved: ReviewTarget): boolean {
  const key = canonicalize(saved);
  return examined.some(target => target !== null && canonicalize(target) === key);
}

type ReplayLaneJudgment = NonNullable<ReturnType<typeof PrePublicationLaneJudgmentsSchema.parse>["standard"]>;

/** Keep one lane's call inputs, and its grants only when no subject has recorded them. */
function nativeReplayLane(judgment: ReplayLaneJudgment, retainGrants: boolean) {
  const { ceilingOverride, additionalPassAuthorization } = retainGrants ? judgment : {};
  return { ...(judgment.scopeMode === undefined ? {} : { scopeMode: judgment.scopeMode }),
    ...(judgment.invocation === undefined ? {} : { invocation: judgment.invocation }),
    ...(ceilingOverride === undefined ? {} : { ceilingOverride }),
    ...(additionalPassAuthorization === undefined ? {} : { additionalPassAuthorization }) };
}

function nativeReplayLanes(input: unknown, retainGrants: boolean): PrePublicationReplayInputV2["lanes"] {
  if (input === undefined) return undefined;
  const supplied = PrePublicationLaneJudgmentsSchema.parse(input);
  const lanes: NonNullable<PrePublicationReplayInputV2["lanes"]> = {};
  for (const lane of ["frontline", "standard"] as const) {
    const judgment = supplied[lane];
    if (judgment === undefined) continue;
    const call = nativeReplayLane(judgment, retainGrants);
    if (Object.keys(call).length > 0) lanes[lane] = call;
  }
  return Object.keys(lanes).length === 0 ? undefined : lanes;
}

/**
 * Emit an exact continuation, retaining decisions only in the repository replay contract. A native continuation keeps
 * the call's ceiling-override and additional-pass grants only when `retainGrants` says no subject has recorded them.
 */
export function buildPrePublicationResumeCommand(input: {
  workUnit: string; candidateId: CanonicalDigest; candidateSubjectDigest: CanonicalDigest;
  judgment: ReviewPrePublicationJudgment; replaySelfReview: "settled" | undefined; replayLanes: unknown;
  scopeJudgmentTarget?: ReviewTarget; currentFrontlineHeadSha: string; frontlineCeilingOverrideApplied: boolean;
  schemaVersion: 1 | 2; retainGrants?: boolean;
}): string {
  const common = { candidateId: input.candidateId, candidateSubjectDigest: input.candidateSubjectDigest,
    ...(input.replaySelfReview === undefined ? {} : { selfReview: input.replaySelfReview }),
    ...(input.judgment.changeSet === undefined ? {} : { changeSet: input.judgment.changeSet }),
    ...(input.scopeJudgmentTarget === undefined ? {} : { scopeJudgmentTarget: input.scopeJudgmentTarget }) };
  if (input.schemaVersion === 2) {
    const lanes = nativeReplayLanes(input.replayLanes, input.retainGrants === true);
    return `arc review pre-publication ${input.workUnit} --resume ${encodePrePublicationReplay({ ...common,
      ...(lanes === undefined ? {} : { lanes }) }, 2)}`;
  }
  let replayLanes = input.replayLanes;
  let replayFrontlineCeilingHeadSha = input.judgment.frontlineCeilingHeadSha;
  if (input.frontlineCeilingOverrideApplied) replayFrontlineCeilingHeadSha = input.currentFrontlineHeadSha;
  else if (replayFrontlineCeilingHeadSha !== undefined && replayFrontlineCeilingHeadSha !== input.currentFrontlineHeadSha) {
    replayLanes = consumeFrontlineCeilingOverride(replayLanes);
    replayFrontlineCeilingHeadSha = undefined;
  }
  const resume = encodePrePublicationReplay({ ...common,
    ...(replayLanes === undefined ? {} : { lanes: replayLanes }),
    ...(replayFrontlineCeilingHeadSha === undefined ? {} : { frontlineCeilingHeadSha: replayFrontlineCeilingHeadSha }) }, 1);
  return `arc review pre-publication ${input.workUnit} --resume ${resume}`;
}
