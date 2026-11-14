/** Read-only comparison of the import's consumed transient identity input against the window hold. */
import { listWindowRefs, readWindowRefTip, type WindowGitReadIO } from "./git.js";
import { readWindowTransientRecords, type WindowTransientRecord, isWindowIdentityRef } from "./transients.js";
import { readLandedWindowTransients } from "./landed-transients.js";
import { canonicalize } from "../../lib/kernel/canonical/canonical-json.js";
import type { WindowFinding } from "./result.js";
import { IMPORT_KEPT_PREFIX } from "../../lib/store/ref/import/transient-cleanup.js";

/** Immutable identity coordinates used by a restore's persisted consumption decision. */
export interface WindowConsumedIdentity { ref: string; held: string | null; kept: string | null }
/** Whether an import consumed nothing, retained exact source tips, or retained only landed records. */
export interface WindowConsumption {
  regime: "unconsumed" | "kept" | "records";
  identities: WindowConsumedIdentity[];
  findings: WindowFinding[];
}

/** Compare consumption without creating the manifests or temporary refs a store listing would write. */
export async function compareWindowConsumption(io: WindowGitReadIO,
  held: Readonly<Record<string, string>>): Promise<WindowConsumption> {
  const identities: WindowConsumedIdentity[] = Object.entries(held).filter(([ref]) => isWindowIdentityRef(ref))
    .map(([ref, tip]) => ({ ref, held: tip, kept: null as string | null }));
  if (await readWindowRefTip(io, "refs/arc/project/registry") === null) return { regime: "unconsumed", identities, findings: [] };
  const tips = await listWindowRefs(io, [IMPORT_KEPT_PREFIX]);
  const kept = new Map([...tips].map(([ref, tip]) => ["refs/arc/" + ref.slice(IMPORT_KEPT_PREFIX.length), tip]));
  for (const [ref, tip] of kept) {
    if (!identities.some(identity => identity.ref === ref)) identities.push({ ref, held: null, kept: tip });
  }
  for (const identity of identities) identity.kept = kept.get(identity.ref) ?? null;
  if (kept.size === 0) {
    return { regime: "records", ...await compareWindowLandedConsumption(io, held) };
  }
  return { regime: "kept", identities, findings: await compareKeptRecords(io, identities) };
}

/** Compare the published transient records directly with the identity inputs retained by the check. */
export async function compareWindowLandedConsumption(io: WindowGitReadIO,
  held: Readonly<Record<string, string>>): Promise<Pick<WindowConsumption, "identities" | "findings">> {
  const identities: WindowConsumedIdentity[] = Object.entries(held).filter(([ref]) => isWindowIdentityRef(ref))
    .map(([ref, tip]) => ({ ref, held: tip, kept: null }));
  const expected = await readWindowTransientRecords(io, held);
  const actual = await readLandedWindowTransients(io);
  return { identities, findings: [...expected.findings, ...compareRecords(identities, expected.records, actual, { rejectErrands: true })] };
}

function consumptionFinding(identity: WindowConsumedIdentity, detail: string): WindowFinding {
  return { subject: identity.ref,
    condition: `${identity.ref}: held ${identity.held ?? "absent"}; kept ${identity.kept ?? "absent"}. ${detail}`,
    remedy: "Settle the consumed change, then use restore --accept with the consumed tip (or absent after kept tips were dropped) and retry." };
}

function compareRecords(identities: WindowConsumedIdentity[], expected: readonly WindowTransientRecord[],
  actual: readonly WindowTransientRecord[], options: { rejectErrands: boolean }): WindowFinding[] {
  const byReference = (records: readonly WindowTransientRecord[]) => new Map(records.map(record => [canonicalize(record.reference), record]));
  const before = byReference(expected), after = byReference(actual);
  const findings: WindowFinding[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(key), right = after.get(key), record = right ?? left;
    if (!record || left?.content === right?.content && !(options.rejectErrands && record.reference.kind.startsWith("work-item/"))) continue;
    let identity = identities.find(item => item.ref === record.ref);
    if (!identity) { identity = { ref: record.ref, held: null, kept: null }; identities.push(identity); }
    findings.push(consumptionFinding(identity, `Expected record ${JSON.stringify(left ?? null)}; consumed record ${JSON.stringify(right ?? null)}.`));
  }
  return findings;
}

async function compareKeptRecords(io: WindowGitReadIO, identities: readonly WindowConsumedIdentity[]): Promise<WindowFinding[]> {
  const findings: WindowFinding[] = [];
  const changed = identities.filter(identity => identity.held !== identity.kept);
  const landed = changed.length > 0 ? await readLandedWindowTransients(io) : [];
  for (const identity of changed) {
    const read = (tip: string | null) => tip === null ? Promise.resolve({ records: [], findings: [] })
      : readWindowTransientRecords(io, { [identity.ref]: tip });
    const [expected, actual] = await Promise.all([read(identity.held), read(identity.kept)]);
    const differences = [...expected.findings, ...actual.findings,
      ...compareRecords([identity], expected.records, actual.records, { rejectErrands: false }),
      ...compareRecords([identity], expected.records, landed.filter(record => record.ref === identity.ref), { rejectErrands: true })];
    findings.push(consumptionFinding(identity, ["The import retained a different identity input.",
      ...new Set(differences.map(finding => finding.condition))].join("\n")));
  }
  return findings;
}
