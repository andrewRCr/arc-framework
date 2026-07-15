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

import { walkCommitShortOption } from "./commit-message-source.js";

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
const MESSAGE_LONG_OPTION = "--message";

function isMessageLongOption(option: string): boolean {
  return option.length > 2 && MESSAGE_LONG_OPTION.startsWith(option);
}

/**
 * Redact commit-message payloads from a wrapped-git argv: replace any
 * `-m` / `--message` value — separated (`-m subj`), attached-short
 * (`-msubj`), attached-long (`--message=subj`), or a Git-accepted
 * abbreviated long form — with `<redacted>`, preserving flag shape so
 * the audit entry remains structurally faithful. Non-message args
 * (including `--file` paths and push remotes/refspecs) are kept verbatim.
 */
export function sanitizeArgs(command: AuditCommand, args: readonly string[]): string[] {
  if (command !== "release-commit") return [...args];

  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === "--") {
      out.push(...args.slice(i));
      break;
    }
    if (isMessageLongOption(a)) {
      out.push(a);
      if (i + 1 < args.length) {
        out.push(REDACTED);
        i++;
      }
      continue;
    }
    if (a.startsWith("--")) {
      const separator = a.indexOf("=");
      if (separator !== -1) {
        const option = a.slice(0, separator);
        if (isMessageLongOption(option)) {
          out.push(`${option}=${REDACTED}`);
          continue;
        }
      }
    }
    if (a.startsWith("-") && !a.startsWith("--") && a !== "-") {
      const walk = walkCommitShortOption(a, args[i + 1]);
      if (walk.kind === "recognized") {
        const message = walk.members.find((member) => member.role === "message");
        if (message?.operand.kind === "attached") {
          out.push(`${a.slice(0, message.offset + 1)}${REDACTED}`);
          continue;
        }
        if (message?.operand.kind === "separated") {
          out.push(a, REDACTED);
          i += 1;
          continue;
        }
        out.push(a);
        if (walk.consumedNext && i + 1 < args.length) {
          out.push(args[i + 1] as string);
          i += 1;
        }
        continue;
      }

      const plausibleMessage = a.indexOf("m", Math.max(1, walk.offset));
      if (plausibleMessage !== -1) {
        if (plausibleMessage + 1 < a.length) {
          out.push(`${a.slice(0, plausibleMessage + 1)}${REDACTED}`);
        } else if (i + 1 < args.length) {
          out.push(a, REDACTED);
          i += 1;
        } else {
          out.push(a);
        }
        continue;
      }
    }
    out.push(a);
  }
  return out;
}

/**
 * Map the active-WU resolver result to the audit-entry `wu` field. A
 * resolver result with an empty `name` — the lite layout carries no
 * parseable WU name — maps to `null`; otherwise the name is carried through.
 */
export function toAuditWorkUnit(
  resolved: { name: string } | null,
): AuditWorkUnit | null {
  if (!resolved) return null;
  if (resolved.name === "") return null;
  return { name: resolved.name };
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

  if (e.schemaVersion !== 2) {
    throw new Error(`audit-log: schemaVersion must be 2, got ${String(e.schemaVersion)}`);
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
  const outcome = e.outcome as Record<string, unknown>;
  const outcomeKind = outcome.kind;
  if (typeof outcomeKind !== "string") {
    throw new Error("audit-log: outcome.kind must be a string");
  }
  validateOutcomeForCommand(command, outcomeKind);
  if (
    outcomeKind === "preflight-failed"
    && outcome.reason !== "validation"
    && outcome.reason !== "input"
  ) {
    throw new Error("audit-log: preflight-failed reason must be validation or input");
  }

  if (e.wu !== null && typeof e.wu !== "object") {
    throw new Error("audit-log: wu must be an object or null");
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
  if (
    outcomeKind === "preflight-failed"
    && (e.decision !== "refused" || e.refusalCode !== 16)
  ) {
    throw new Error("audit-log: preflight-failed requires decision refused and refusalCode 16");
  }
  if (e.refusalCode === 16 && outcomeKind !== "preflight-failed") {
    throw new Error("audit-log: refusalCode 16 requires preflight-failed outcome");
  }
}

function validateOutcomeForCommand(command: AuditCommand, kind: string): void {
  switch (command) {
    case "release-commit":
      if (
        kind !== "commit"
        && kind !== "hook-failed"
        && kind !== "preflight-failed"
        && kind !== "refused"
      ) {
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
