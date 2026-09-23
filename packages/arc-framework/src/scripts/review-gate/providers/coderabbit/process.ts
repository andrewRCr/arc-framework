/** Direct CodeRabbit process execution with abort-driven termination. */

import { execa } from "execa";

import type { InteractionContext } from "../../../../lib/command-input/interaction-context.js";
import { MAX_GIT_OUTPUT_BYTES } from "../../../../lib/git/process-executor.js";

export interface CodeRabbitProcessResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  canceled: boolean;
}

function redactCredentialAssignment(_match: string, key: string, separator: string, value: string): string {
  const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : "";
  return `${key}${separator}${quote}[redacted]${quote}`;
}

function boundedDiagnostic(candidate: string): string {
  return candidate
    .replace(/\bBearer\s+\S+/giu, "Bearer [redacted]")
    .replace(
      /\b([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}]+)/giu,
      redactCredentialAssignment,
    )
    .replace(
      /\b((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|key|tokens?|secrets?|passwords?|passphrases?|passwd|pwd|credentials?|cookies?|sessions?|authorization))(["']?\s*:\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}]+)/giu,
      redactCredentialAssignment,
    )
    .replace(/\b(https?:\/\/)[^\s/@]+@/giu, "$1[redacted]@")
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);
}

function agentOutputDiagnostic(stdout: string): string {
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof event !== "object" || event === null || Array.isArray(event)) continue;
    const record = event as Record<string, unknown>;
    const incomplete = record.type === "error"
      || (record.type === "complete" && (record.outcome === "failed"
        || (typeof record.unreviewedFileCount === "number" && record.unreviewedFileCount > 0)));
    if (incomplete && typeof record.message === "string") return boundedDiagnostic(record.message);
  }
  return "";
}

/** Preserve a short local process diagnostic without carrying credentials or unbounded output. */
export function codeRabbitProcessDiagnostic(
  error: unknown,
  stage: "provider process" | "executable resolution" = "provider process",
): string {
  if (!(error instanceof Error)) return `${stage} exception: no diagnostic available`;
  const candidate = "shortMessage" in error && typeof error.shortMessage === "string"
    ? error.shortMessage
    : error.message;
  const message = boundedDiagnostic(candidate);
  const code = "code" in error && typeof error.code === "string"
    && /^[A-Z][A-Z0-9_]{1,60}$/u.test(error.code)
    ? ` (${error.code})`
    : "";
  return `${stage} exception${code}: ${message || "no diagnostic available"}`;
}

/** Summarize a nonzero provider exit while retaining its actionable stderr. */
export function codeRabbitExitDiagnostic(exitCode: number | null, stderr: string, stdout: string): string {
  const detail = boundedDiagnostic(stderr) || agentOutputDiagnostic(stdout);
  return `process-exit:${exitCode ?? "unknown"}${detail ? `: ${detail}` : ""}`;
}

/** Run one exact executable path without a shell and terminate it when the caller aborts. */
export async function runCodeRabbitProcess(
  command: string,
  argv: readonly string[],
  options: {
    cwd: string;
    remainingMs: number;
    signal: AbortSignal;
    interaction?: InteractionContext["subprocess"];
  },
): Promise<CodeRabbitProcessResult> {
  const result = await execa(command, argv, {
    cwd: options.cwd,
    reject: false,
    stripFinalNewline: false,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    cancelSignal: options.signal,
    forceKillAfterDelay: 1_000,
    ...(options.interaction?.ambientStdin === "closed" ? { stdin: "ignore" as const } : {}),
  });
  return {
    exitCode: result.exitCode ?? null,
    signal: result.signal ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
    canceled: result.isCanceled,
  };
}
