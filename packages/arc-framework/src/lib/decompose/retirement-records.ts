/** Dependent, home, fan-out, and stored-map mutations for a retirement's terminal batch. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeTerminalEdges } from "./terminal-edges.js";
import type { DecomposeResult } from "./refusal.js";
import type { Mutation } from "../store/write.js";
import type { StoreRecord } from "../store/read.js";
import { prepareDecomposeTerminalEdges } from "./terminal-edges.js";
import { recordPut } from "../store/lifecycle-write.js";
import { writeMetaDependsOn } from "../store/kinds/meta/writers.js";
import { sameReference } from "../store/identity.js";
import { writeCohortFanout } from "../store/kinds/cohort/index.js";
import { decomposeFinishArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

/** Version-bound additional writes; the lifecycle executor owns primary removal. */
export interface DecomposeRetirementRecordPlan {
  writes: readonly Mutation[];
  records: readonly StoreRecord[];
  edges: DecomposeTerminalEdges;
  fanout?: { path: string; status: "appended" | "reused"; record: StoreRecord; members: readonly string[] };
}

/** Prepare existing-recipient edge edits, fan-out, and map removal without writing. */
export async function prepareDecomposeRetirementRecords(ctx: DecomposeContext, input: DecomposeTerminalRecords): Promise<DecomposeResult<DecomposeRetirementRecordPlan>> {
  const edges = await prepareDecomposeTerminalEdges(ctx, input);
  if (edges.status === "refused") return edges;
  const writes: Mutation[] = edges.result.projection.edits.map(edit => recordPut(edit.primary, {
    content: writeMetaDependsOn(edit.primary.content, edit.afterTargets),
  }));
  const map = input.acquired.storedMap;
  writes.push({ action: "remove", reference: map.reference, expected: map.version });
  const fanout = retirementFanout(input);
  if (fanout.status === "refused") return fanout;
  writes.push(...fanout.result.writes);
  const records = [...input.records, ...edges.result.facts.dependents].filter((record, index, all) =>
    all.findIndex(other => sameReference(record.reference, other.reference)) === index);
  return { status: "ok", result: { ...fanout.result, writes, records, edges: edges.result } };
}

function retirementFanout(input: DecomposeTerminalRecords): DecomposeResult<Pick<DecomposeRetirementRecordPlan, "fanout"> & { writes: readonly Mutation[] }> {
  const placement = input.map.authoring.placement;
  if (placement.kind !== "at-cap") return { status: "ok", result: { writes: [] } };
  const origin = input.acquired.primary.reference.owner.name;
  const argv = decomposeFinishArgv(origin);
  const cohort = input.cohorts.find(candidate => candidate.path === placement.parent);
  if (cohort === undefined) return { status: "refused", reason: "cohort-parent", class: "recoverable", locus: placement.parent,
    remedy: { text: `Restore the open subcohort document and its Parent through write-back, then ${renderV3DecomposeArgv(argv)}.`, argv: [...argv] } };
  const members = input.map.authoring.destinations.flatMap(destination => destination.kind === "new-member" ? [destination.slug] : [])
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const fanout = writeCohortFanout(cohort.record.content, origin, members);
  if (fanout.status === "refused") return { status: "refused", reason: "fanout-conflict", class: "recoverable",
    locus: `${placement.parent}#fanout:${origin}`,
    remedy: { text: `Repair or remove ${origin}'s fan-out block in ${placement.parent} through write-back, then ${renderV3DecomposeArgv(argv)}.`, argv: [...argv] } };
  return { status: "ok", result: {
    writes: fanout.status === "reused" ? [] : [recordPut(cohort.record, { content: fanout.content })],
    fanout: { path: placement.parent, status: fanout.status, record: cohort.record, members },
  } };
}
