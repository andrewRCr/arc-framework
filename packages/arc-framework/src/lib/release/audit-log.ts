/**
 * Audit-log writer for the release-wrapper validation library.
 *
 * Emits one schema-validated JSONL entry per `arc release commit`,
 * `arc release push`, and `arc sync` invocation under
 * `.arc/user/{identity}/.internal/.audit-log.jsonl` — append-only,
 * gitignored, per-identity. Argv sanitization redacts `-m` /
 * `--message` payloads at write time so commit-message content never
 * lands on disk in the audit log.
 *
 * Failure-mode split: schema violations throw (precondition violation
 * surfaced at test time); I/O failures return `{ ok: false, error }`
 * so an unwritable audit log never masks a successful
 * commit/push/sync.
 *
 * @module
 */

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type {
  AuditCommand,
  AuditEntry,
  AuditWorkUnit,
} from "./types.js";

export interface AuditLogContext {
  cwd: string;
  identity: string;
}

/**
 * Resolve the audit-log file path for the given identity, anchored at
 * `cwd`. Pure path math — does not touch the filesystem.
 */
export function resolveAuditLogPath(ctx: AuditLogContext): string {
  return join(ctx.cwd, ".arc", "user", ctx.identity, ".internal", ".audit-log.jsonl");
}

/**
 * Ensure the audit-log parent directory (`.arc/user/{identity}/.internal/`)
 * exists. Idempotent: creates the directory tree on first call, no-op when
 * the directory already exists.
 */
export async function ensureAuditLogParent(ctx: AuditLogContext): Promise<void> {
  const parent = join(ctx.cwd, ".arc", "user", ctx.identity, ".internal");
  await mkdir(parent, { recursive: true });
}

const REDACTED = "<redacted>";

/**
 * Redact commit-message payloads from a wrapped-git argv: replace any
 * `-m` / `--message` value — separated (`-m subj`), attached-short
 * (`-msubj`), or attached-long (`--message=subj`) — with `<redacted>`,
 * preserving flag shape so the audit entry remains structurally
 * faithful. Non-message args (including `--file` paths and push
 * remotes/refspecs) are kept verbatim.
 */
export function sanitizeArgs(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === "-m" || a === "--message") {
      out.push(a);
      if (i + 1 < args.length) {
        out.push(REDACTED);
        i++;
      }
      continue;
    }
    if (a.startsWith("-m") && a.length > 2 && !a.startsWith("--")) {
      out.push(`-m${REDACTED}`);
      continue;
    }
    if (a.startsWith("--message=")) {
      out.push(`--message=${REDACTED}`);
      continue;
    }
    out.push(a);
  }
  return out;
}

/**
 * Map the active-WU resolver result to the audit-entry `wu` field. Drops
 * resolver-empties: a resolver `{category: "", name: ""}` (lite layout) maps
 * to `null`; an empty `category` paired with a non-empty `name` (future flat
 * layout) emits `{name}` only — the writer never persists empty-string
 * category values.
 */
export function toAuditWorkUnit(
  resolved: { category: string; name: string } | null,
): AuditWorkUnit | null {
  if (!resolved) return null;
  if (resolved.name === "") return null;
  if (resolved.category === "") return { name: resolved.name };
  return { category: resolved.category, name: resolved.name };
}

/**
 * Append one audit entry to the per-identity JSONL log. Schema-validates the
 * entry (throws on violation — precondition failure surfaced at test time)
 * before any I/O. Filesystem errors return `{ ok: false, error }` so an
 * unwritable audit log never masks a successful commit/push/sync.
 */
export async function appendAuditEntry(opts: {
  cwd: string;
  identity: string;
  entry: AuditEntry;
}): Promise<{ ok: true } | { ok: false; error: Error }> {
  validateEntry(opts.entry);
  try {
    await ensureAuditLogParent(opts);
    const path = resolveAuditLogPath(opts);
    await appendFile(path, `${JSON.stringify(opts.entry)}\n`, "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

const VALID_COMMANDS: readonly AuditCommand[] = ["release-commit", "release-push", "sync"];

/**
 * Runtime narrowing for unverified-shape entries — the typed-input happy path
 * is enforced at every call site, but tests, `JSON.parse`-rehydrated entries
 * (future `arc audit`), and refactor drift bypass that. The validator accepts
 * `unknown` and narrows to `AuditEntry`, so comparisons inside read as honest
 * shape checks rather than casts that fight the type system.
 */
function validateEntry(entry: unknown): asserts entry is AuditEntry {
  if (typeof entry !== "object" || entry === null) {
    throw new Error("audit-log: entry must be an object");
  }
  const e = entry as Record<string, unknown>;

  if (e.schemaVersion !== 1) {
    throw new Error(`audit-log: schemaVersion must be 1, got ${String(e.schemaVersion)}`);
  }
  if (typeof e.timestamp !== "string") {
    throw new Error("audit-log: timestamp must be a string");
  }
  if (
    typeof e.command !== "string"
    || !(VALID_COMMANDS as readonly string[]).includes(e.command)
  ) {
    throw new Error(`audit-log: unknown command "${String(e.command)}"`);
  }
  const command = e.command as AuditCommand;

  if (!Array.isArray(e.args) || !e.args.every((a) => typeof a === "string")) {
    throw new Error("audit-log: args must be a string array");
  }

  if (typeof e.interlockState !== "object" || e.interlockState === null) {
    throw new Error("audit-log: interlockState must be an object");
  }
  const interlockState = e.interlockState as Record<string, unknown>;
  if (interlockState.command !== command) {
    throw new Error(
      `audit-log: interlockState.command "${String(interlockState.command)}" `
      + `does not match top-level command "${command}"`,
    );
  }

  if (typeof e.outcome !== "object" || e.outcome === null) {
    throw new Error("audit-log: outcome must be an object");
  }
  const outcomeKind = (e.outcome as Record<string, unknown>).kind;
  if (typeof outcomeKind !== "string") {
    throw new Error("audit-log: outcome.kind must be a string");
  }
  validateOutcomeForCommand(command, outcomeKind);

  if (e.wu !== null) {
    if (typeof e.wu !== "object") {
      throw new Error("audit-log: wu must be an object or null");
    }
    const wu = e.wu as Record<string, unknown>;
    if (wu.category === "") {
      throw new Error("audit-log: wu.category must be omitted (undefined), not empty string");
    }
  }

  if (e.decision !== "proceeded" && e.decision !== "refused") {
    throw new Error(`audit-log: decision must be "proceeded" or "refused", got ${JSON.stringify(e.decision)}`);
  }
  if (e.decision === "proceeded" && e.refusalCode !== null) {
    throw new Error(
      `audit-log: decision "proceeded" requires refusalCode null, got ${JSON.stringify(e.refusalCode)}`,
    );
  }
  if (e.decision === "refused" && e.refusalCode === null) {
    throw new Error("audit-log: decision \"refused\" requires refusalCode to be populated");
  }
}

function validateOutcomeForCommand(command: AuditCommand, kind: string): void {
  switch (command) {
    case "release-commit":
      if (kind !== "commit" && kind !== "hook-failed" && kind !== "refused") {
        throw outcomeMismatch(command, kind);
      }
      return;
    case "release-push":
      if (kind !== "push" && kind !== "hook-failed" && kind !== "refused") {
        throw outcomeMismatch(command, kind);
      }
      return;
    case "sync":
      if (kind !== "sync" && kind !== "refused") {
        throw outcomeMismatch(command, kind);
      }
      return;
    default: {
      const exhaustive: never = command;
      throw new Error(`audit-log: unhandled command "${String(exhaustive)}"`);
    }
  }
}

function outcomeMismatch(command: AuditCommand, kind: string): Error {
  return new Error(`audit-log: outcome.kind "${kind}" not allowed for command "${command}"`);
}
