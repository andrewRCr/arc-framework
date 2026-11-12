/** One schema-validated audit entry for each resolved runtime sync invocation. */
import { appendAuditEntry, toAuditWorkUnit } from "../lib/release/audit-log.js";
import { AuditEntrySchema, type AuditEntry, type AuditOutcome } from "../lib/release/schema.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import type { InterlockState, SyncOutcome } from "./sync.js";

// These cells refuse at the pushability precheck. Notes-blocked proceeds with
// partial leg outcomes; blocked-no-upstream is not reachable under the matrix.
const REFUSED_SYNC_CELLS: ReadonlySet<string> = new Set([
  "blocked-diverged", "blocked-remote-ahead", "blocked-detached-head",
  "blocked-no-remote", "blocked-branch-gone", "blocked-remote-unavailable",
]);

/**
 * Record a completed execution or preflight failure using the current audit format.
 * Identity-absent, no-project, and dry-run callers omit this write.
 * @param args - Resolved invocation identity, policy, and observable leg outcomes.
 * @returns Resolves after the append attempt; audit I/O failures do not mask the outcome.
 */
export async function writeSyncAuditEntry(args: {
  cwd: string;
  identity: string;
  outcome: Pick<SyncOutcome, "cell" | "worktree" | "notes" | "exitCode">;
  interlockState: InterlockState;
}): Promise<void> {
  const wu = await resolveActiveWu({ cwd: args.cwd });
  const wuAudit = wu.status === "resolved" ? toAuditWorkUnit(wu) : null;
  const refused = REFUSED_SYNC_CELLS.has(args.outcome.cell);
  const auditOutcome: AuditOutcome = {
    kind: "sync",
    cell: args.outcome.cell,
    worktree: encodeLegToken(args.outcome.worktree),
    notes: encodeLegToken(args.outcome.notes),
    exitCode: args.outcome.exitCode,
  };
  const entry: AuditEntry = AuditEntrySchema.parse({
    schemaVersion: 2,
    timestamp: new Date().toISOString(),
    command: "sync",
    args: [],
    wu: wuAudit,
    interlockState: { command: "sync", ...args.interlockState },
    decision: refused ? "refused" : "proceeded",
    refusalCode: refused ? 14 : null,
    outcome: auditOutcome,
  });
  await appendAuditEntry({ cwd: args.cwd, identity: args.identity, entry });
}

// The first two colons delimit action and result; any remaining colons belong to detail.
function encodeLegToken(record: SyncOutcome["worktree"]): string {
  return record.detail !== undefined
    ? `${record.action}:${record.result}:${record.detail}`
    : `${record.action}:${record.result}`;
}
