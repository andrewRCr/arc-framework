/** Version-pinned fail-closed parser for CodeRabbit agent-mode frontline output. */

import { canonicalDigest } from "../../../../lib/kernel/index.js";

import type { NormalizedReviewFinding } from "../../core/finding-records.js";

export const CODERABBIT_AGENT_CLI_VERSION = "0.6.5";
export const CODERABBIT_AGENT_MODE = "agent";

export type CodeRabbitAgentProviderResult =
  | { kind: "clean" }
  | { kind: "findings"; findings: NormalizedReviewFinding[] }
  | { kind: "rate-limited" }
  | { kind: "stale-head"; expectedHeadSha: string; observedHeadSha: string }
  | { kind: "ambiguous" }
  | { kind: "partial" }
  | { kind: "malformed" }
  | { kind: "failed"; reason: string };

interface AgentFindingEvent {
  type: "finding";
  severity: "blocker" | "major" | "minor";
  fileName: string;
  codegenInstructions: string;
  suggestions: unknown[];
}

interface AgentCompleteEvent {
  type: "complete";
  status: "review_completed";
  findings: number;
  reviewedFiles: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFindingEvent(event: Record<string, unknown>): AgentFindingEvent | null {
  const severity = event.severity;
  if (event.type !== "finding"
    || (severity !== "blocker" && severity !== "major" && severity !== "minor")
    || typeof event.fileName !== "string"
    || event.fileName.trim().length === 0
    || typeof event.codegenInstructions !== "string"
    || event.codegenInstructions.trim().length === 0
    || !Array.isArray(event.suggestions)) {
    return null;
  }
  return {
    type: "finding",
    severity,
    fileName: event.fileName.trim(),
    codegenInstructions: event.codegenInstructions.trim(),
    suggestions: event.suggestions,
  };
}

function parseCompleteEvent(event: Record<string, unknown>): AgentCompleteEvent | null {
  if (event.type !== "complete"
    || event.status !== "review_completed"
    || !Number.isSafeInteger(event.findings)
    || Number(event.findings) < 0
    || !Array.isArray(event.reviewedFiles)
    || event.reviewedFiles.length === 0
    || event.reviewedFiles.some((file) => typeof file !== "string" || file.trim().length === 0)) {
    return null;
  }
  return {
    type: "complete",
    status: "review_completed",
    findings: Number(event.findings),
    reviewedFiles: event.reviewedFiles.map((file) => String(file).trim()),
  };
}

function normalizeFinding(event: AgentFindingEvent): NormalizedReviewFinding {
  return {
    findingId: canonicalDigest({
      schemaVersion: 1,
      provider: "coderabbit-cli",
      cliVersion: CODERABBIT_AGENT_CLI_VERSION,
      mode: CODERABBIT_AGENT_MODE,
      finding: event,
    }),
    severity: event.severity,
    locus: event.fileName,
    evidenceUrlOrId: event.codegenInstructions,
  };
}

/**
 * Parse the qualified CodeRabbit agent-mode NDJSON contract without inferring success.
 *
 * @param input - Captured direct-process result plus exact target head binding.
 * @returns A provider result accepted by frontline outcome normalization.
 */
export function parseCodeRabbitAgentResult(input: {
  cliVersion: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  expectedHead: string;
  observedHead: string;
}): CodeRabbitAgentProviderResult {
  if (input.cliVersion !== CODERABBIT_AGENT_CLI_VERSION) return { kind: "malformed" };
  if (input.observedHead !== input.expectedHead) {
    return {
      kind: "stale-head",
      expectedHeadSha: input.expectedHead,
      observedHeadSha: input.observedHead,
    };
  }
  if (/rate limit(?:ed| exceeded)?/iu.test(`${input.stdout}\n${input.stderr}`)) {
    return { kind: "rate-limited" };
  }
  if (input.signal !== null) return { kind: "failed", reason: `process-signal:${input.signal}` };
  if (input.exitCode !== 0) return { kind: "failed", reason: "process-exit" };

  const lines = input.stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { kind: "malformed" };

  const findings: NormalizedReviewFinding[] = [];
  let complete: AgentCompleteEvent | null = null;
  let completeIndex = -1;

  for (const [index, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return { kind: "malformed" };
    }
    if (!isRecord(parsed) || typeof parsed.type !== "string") return { kind: "malformed" };

    if (parsed.type === "finding") {
      const finding = parseFindingEvent(parsed);
      if (finding === null) return { kind: "malformed" };
      findings.push(normalizeFinding(finding));
      continue;
    }
    if (parsed.type === "complete") {
      if (complete !== null) return { kind: "ambiguous" };
      complete = parseCompleteEvent(parsed);
      if (complete === null) return { kind: "malformed" };
      completeIndex = index;
      continue;
    }
    if (parsed.type !== "status" && parsed.type !== "review_context" && parsed.type !== "heartbeat") {
      return { kind: "malformed" };
    }
  }

  if (complete === null) return { kind: "partial" };
  if (completeIndex !== lines.length - 1) return { kind: "ambiguous" };
  if (complete.findings !== findings.length) return { kind: "partial" };
  if (new Set(findings.map((finding) => finding.findingId)).size !== findings.length) {
    return { kind: "ambiguous" };
  }
  return findings.length === 0 ? { kind: "clean" } : { kind: "findings", findings };
}
