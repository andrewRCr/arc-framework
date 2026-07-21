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
import { AuditEntrySchema } from "./schema.js";

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
  const entry = parseAuditEntry(opts.entry);
  try {
    await ensureAuditLogParent(opts);
    const path = resolveAuditLogPath(opts);
    await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

function parseAuditEntry(entry: unknown): AuditEntry {
  const parsed = AuditEntrySchema.safeParse(entry);
  if (parsed.success) return parsed.data;

  const paths = issuePaths(parsed.error.issues);
  throw new Error(`audit-log: invalid entry at ${paths.join(", ")}`);
}

function issuePaths(issues: readonly unknown[], prefix: readonly PropertyKey[] = []): string[] {
  const paths: string[] = [];
  for (const issue of issues) {
    if (typeof issue !== "object" || issue === null) continue;
    const record = issue as { path?: readonly PropertyKey[]; errors?: readonly (readonly unknown[])[] };
    const issuePath = [...prefix, ...(record.path ?? [])];
    if (record.errors !== undefined && record.errors.length > 0) {
      paths.push(...record.errors.flatMap((nested) => issuePaths(nested, issuePath)));
      continue;
    }
    const path = issuePath.map(String).join(".");
    paths.push(path === "" ? "<root>" : path);
  }
  return [...new Set(paths)];
}
