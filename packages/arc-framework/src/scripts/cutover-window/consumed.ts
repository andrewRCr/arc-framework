/** Read-only comparison of the import's consumed transient identity input against the window hold. */
import { listWindowRefs, readWindowRefTip, type WindowGitReadIO } from "./git.js";
import { readWindowTransientRecords, type WindowTransientRecord } from "./transients.js";
import { readLandedWindowTransients } from "./landed-transients.js";
import { canonicalize } from "../../lib/kernel/canonical/canonical-json.js";
import type { WindowFinding } from "./result.js";

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
  const identities: WindowConsumedIdentity[] = Object.entries(held).filter(([ref]) => /^refs\/arc\/user\/[^/]+\/errands$/u.test(ref))
    .map(([ref, tip]) => ({ ref, held: tip, kept: null as string | null }));
  if (await readWindowRefTip(io, "refs/arc/project/registry") === null) return { regime: "unconsumed", identities, findings: [] };
  const prefix = "refs/arc/tmp/migrate/import/kept/";
  const tips = await listWindowRefs(io, [prefix]);
  const kept = new Map([...tips].map(([ref, tip]) => ["refs/arc/" + ref.slice(prefix.length), tip]));
  for (const [ref, tip] of kept) {
    if (!identities.some(identity => identity.ref === ref)) identities.push({ ref, held: null, kept: tip });
  }
  for (const identity of identities) identity.kept = kept.get(identity.ref) ?? null;
  if (kept.size === 0) {
    const expected = await readWindowTransientRecords(io, held);
    const actual = await readLandedWindowTransients(io);
    const findings = [...expected.findings, ...compareRecords(identities, expected.records, actual)];
    return { regime: "records", identities, findings };
  }
  const findings = kept.size > 0 ? identities.filter(identity => identity.held !== identity.kept)
    .map(identity => consumptionFinding(identity, "The import retained a different identity input.")) : [];
  return { regime: kept.size > 0 ? "kept" : "records", identities, findings };
}

function consumptionFinding(identity: WindowConsumedIdentity, detail: string): WindowFinding {
  return { subject: identity.ref,
    condition: `${identity.ref}: held ${identity.held ?? "absent"}; kept ${identity.kept ?? "absent"}. ${detail}`,
    remedy: "Settle the consumed change, then use restore --accept with the consumed tip (or absent after kept tips were dropped) and retry." };
}

function compareRecords(identities: WindowConsumedIdentity[], expected: readonly WindowTransientRecord[],
  actual: readonly WindowTransientRecord[]): WindowFinding[] {
  const byReference = (records: readonly WindowTransientRecord[]) => new Map(records.map(record => [canonicalize(record.reference), record]));
  const before = byReference(expected), after = byReference(actual);
  const findings: WindowFinding[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(key), right = after.get(key), record = right ?? left;
    if (!record || left?.content === right?.content && !record.reference.kind.startsWith("work-item/")) continue;
    let identity = identities.find(item => item.ref === record.ref);
    if (!identity) { identity = { ref: record.ref, held: null, kept: null }; identities.push(identity); }
    findings.push(consumptionFinding(identity, `Expected record ${JSON.stringify(left ?? null)}; landed record ${JSON.stringify(right ?? null)}.`));
  }
  return findings;
}
