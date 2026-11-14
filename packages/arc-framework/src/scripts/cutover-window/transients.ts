/** Compare immutable transient identity snapshots using the import's logical record coordinates. */
import { transientKind, transientReference } from "../../lib/store/in-repo/transient-common.js";
import { serializeTransientIdentityRecord } from "../../lib/errand/identity-record.js";
import { canonicalize } from "../../lib/kernel/canonical/canonical-json.js";
import type { WindowGitReadIO } from "./git.js";
import { readTransientIdentitySnapshotAtRef, type TransientIdentitySnapshot } from "../../lib/errand/identity-snapshot.js";
import type { RecordReference } from "../../lib/store/identity.js";
import type { WindowFinding } from "./result.js";

const IDENTITY_REF = /^refs\/arc\/user\/([^/]+)\/errands$/u;

/** Whether a ref is the identity ref that holds one identity's Errand and claim records. */
export function isWindowIdentityRef(ref: string): boolean { return IDENTITY_REF.test(ref); }

/** The identity an identity ref names, or null for any other ref. */
export function windowIdentityRefOwner(ref: string): string | null { return IDENTITY_REF.exec(ref)?.[1] ?? null; }

/** One logical record, retaining the identity ref whose input supplied it. */
export interface WindowTransientRecord { ref: string; reference: RecordReference; content: string }
/** One acquired side of the identity inventory. */
export interface WindowTransientInput { side: "local" | "origin"; records: readonly WindowTransientRecord[] }
/** A complete projection or explicit differences that prohibit treating it as empty. */
export interface WindowTransientRecords { records: WindowTransientRecord[]; findings: WindowFinding[] }

/** Project a pinned snapshot without performing any store or ref write. */
export function projectWindowTransientSnapshot(ref: string, held: string,
  snapshot: TransientIdentitySnapshot): WindowTransientRecords {
  if (snapshot.kind !== "complete" || snapshot.diagnostics.length > 0) {
    const detail = snapshot.kind === "complete" ? JSON.stringify(snapshot.diagnostics)
      : snapshot.kind === "error" ? `error: ${snapshot.message}` : "absent";
    return { records: [], findings: [{ subject: ref, condition: `Held tip ${held} has an incomplete snapshot: ${detail}`,
      remedy: "Repair or recover the held identity snapshot before comparing or restoring its records." }] };
  }
  const identity = windowIdentityRefOwner(ref) ?? "";
  return { records: [...snapshot.records].map(([key, record]) => ({ ref,
    reference: transientReference(transientKind(record), key, identity),
    content: canonicalize(JSON.parse(serializeTransientIdentityRecord(record))),
  })), findings: [] };
}

/** Read each exact identity ref from its held immutable tip, ignoring unrelated ARC refs. */
export async function readWindowTransientRecords(io: WindowGitReadIO,
  refs: Readonly<Record<string, string>>): Promise<WindowTransientRecords> {
  const result: WindowTransientRecords = { records: [], findings: [] };
  const exec: WindowGitReadIO["exec"] = (command, args, options) => io.exec(command, args,
    { ...options, cwd: io.repo, objectAccess: "local-only" });
  for (const [ref, held] of Object.entries(refs)) {
    const identity = windowIdentityRefOwner(ref);
    if (!identity) continue;
    const snapshot = await readTransientIdentitySnapshotAtRef({ exec, identity }, held);
    const projected = projectWindowTransientSnapshot(ref, held, snapshot);
    result.records.push(...projected.records);
    result.findings.push(...projected.findings);
  }
  return result;
}
