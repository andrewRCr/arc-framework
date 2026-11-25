/** Persist a restore's consumed-input decision before later steps remove its evidence. */
import { parseWindowAcceptedValues, type WindowAcceptedValue } from "./restore-accept.js";
import type { WindowRestoreContext } from "./restore.js";
import { compareWindowConsumption, type WindowConsumption } from "./consumed.js";
import { readWindowRestoreDecision, decodeWindowRestoreDecision, type WindowRestoreDecision } from "./restore-decision-document.js";
import { listWindowRefs, readWindowRefTip } from "./git.js";
import { WindowRefusal, type WindowFinding } from "./result.js";
import { hashBlob, writeTreeCommit } from "../../lib/git/ref-tree.js";

interface NeededAcceptance { finding: WindowFinding; value: string | null }
const accepts = (values: readonly WindowAcceptedValue[], ref: string, value: string | null) =>
  values.some(item => item.ref === ref && item.value === value);

function neededAcceptances(comparison: WindowConsumption, local: ReadonlyMap<string, string>): NeededAcceptance[] {
  if (comparison.regime !== "unconsumed") return comparison.findings.map(finding => ({ finding,
    value: comparison.regime === "kept" ? comparison.identities.find(identity => identity.ref === finding.subject)?.kept ?? null : null }));
  return comparison.identities.flatMap(identity => {
    const actual = local.get(identity.ref) ?? null;
    return actual === identity.held ? [] : [{ value: actual, finding: { subject: identity.ref,
      condition: `${identity.ref}: held ${identity.held ?? "absent"}; current ${actual ?? "absent"}; no import has consumed this input.`,
      remedy: "Settle the changed identity input, name its current value with restore --accept, then retry." } }];
  });
}

async function validateAccepted(context: WindowRestoreContext, accepted: readonly WindowAcceptedValue[],
  evidence: { local: ReadonlyMap<string, string>; needed: readonly NeededAcceptance[] }): Promise<void> {
  if (accepted.length === 0) return;
  const origin = await context.host.refs(["refs/arc/*"]);
  const invalid = accepted.filter(item => !evidence.needed.some(need => need.finding.subject === item.ref && need.value === item.value)
    && (evidence.local.get(item.ref) ?? null) !== item.value && (origin[item.ref] ?? null) !== item.value);
  if (invalid.length > 0) throw new WindowRefusal(invalid.map(item => ({ subject: item.ref,
    condition: `The accepted value ${item.value ?? "absent"} is neither the consumed input nor a current local or origin value.`,
    remedy: "Read and settle the value actually found, then supply that exact --accept operand and retry restore." })));
}

/** Read the saved decision or compare and record input before the first restore write. */
export async function recordWindowRestoreDecision(context: WindowRestoreContext): Promise<WindowRestoreDecision> {
  const accepted = parseWindowAcceptedValues(context.input.accept ?? []);
  const recorded = await readWindowRefTip(context.io, "refs/arc-window/restore");
  if (recorded !== null) return extendRecordedDecision(context, recorded, accepted);
  const comparison = await compareWindowConsumption(context.io, context.record.refs.local);
  const local = await listWindowRefs(context.io, ["refs/arc/"]);
  const needed = neededAcceptances(comparison, local);
  const unresolved = needed.filter(need => !accepts(accepted, need.finding.subject, need.value));
  if (unresolved.length > 0) throw new WindowRefusal(unresolved.map(need => ({ ...need.finding,
    remedy: `Settle this change, then supply --accept ${need.finding.subject}=${need.value ?? "absent"} and retry restore.` })));
  await validateAccepted(context, accepted, { local, needed });
  const decision: WindowRestoreDecision = { version: 1, windowTip: context.tip, regime: comparison.regime,
    identities: comparison.identities.map(identity => ({ ...identity,
      outcome: needed.some(need => need.finding.subject === identity.ref) ? "accepted" : comparison.regime === "unconsumed" ? "unconsumed" : "equal" })),
    accepted, differences: needed.map(need => need.finding) };
  return writeDecision(context, decision, null);
}

async function extendRecordedDecision(context: WindowRestoreContext, tip: string,
  input: readonly WindowAcceptedValue[]): Promise<WindowRestoreDecision> {
  const decision = await readWindowRestoreDecision(context, tip);
  const added = input.filter(item => !accepts(decision.accepted, item.ref, item.value));
  if (added.length === 0) return decision;
  const local = await listWindowRefs(context.io, ["refs/arc/"]);
  await validateAccepted(context, added, { local, needed: [] });
  return writeDecision(context, { ...decision, accepted: [...decision.accepted, ...added] }, tip);
}

async function writeDecision(context: WindowRestoreContext, decision: WindowRestoreDecision,
  expected: string | null): Promise<WindowRestoreDecision> {
  decodeWindowRestoreDecision(decision, context);
  const blob = await hashBlob(context.io.execInput, JSON.stringify(decision) + "\n");
  await context.step?.("restore.compare-record");
  await writeTreeCommit(context.io, "refs/arc-window/restore", new Map([["restore.json", blob]]),
    "Record cutover restore decision", expected === null ? [] : [expected], expected);
  return decision;
}
