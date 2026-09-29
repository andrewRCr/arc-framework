/** Structurally qualified, fail-closed parser for CodeRabbit agent-mode frontline output. */

import { canonicalDigest } from "../../../../lib/kernel/index.js";

import {
  NormalizedReviewFindingsSchema,
  captureReviewFindingSourceLabel,
  type NormalizedReviewFinding,
} from "../../core/finding-records.js";
import { codeRabbitExitDiagnostic } from "./process.js";

export const CODERABBIT_AGENT_MODE = "agent";
export const CODERABBIT_AGENT_CONTRACT = "coderabbit-agent-ndjson/v1";

export type CodeRabbitAgentProviderResult =
  | { kind: "clean" }
  | { kind: "findings"; findings: NormalizedReviewFinding[] }
  | { kind: "rate-limited" }
  | { kind: "capability-unsupported" }
  | { kind: "stale-head"; expectedHeadSha: string; observedHeadSha: string }
  | { kind: "ambiguous" }
  | { kind: "partial" }
  | { kind: "malformed" }
  | { kind: "failed"; reason: string };

interface AgentFindingFields {
  type: "finding";
  severity: "blocker" | "major" | "minor";
  fileName: string;
  suggestions: unknown[];
}

/** A finding carrying agent fix instructions; its identity digests exactly these fields. */
interface InstructedAgentFinding extends AgentFindingFields {
  codegenInstructions: string;
}

/** A finding emitted without fix instructions, identified by the review comment the provider sends instead. */
interface CommentedAgentFinding extends AgentFindingFields {
  comment: string;
}

type AgentFindingEvent = InstructedAgentFinding | CommentedAgentFinding;

/**
 * A validated finding event plus its review comment. The comment is display-only for an instructed finding and
 * never enters that finding's identity.
 */
interface ParsedAgentFinding {
  contract: AgentFindingEvent;
  comment: string | null;
}

interface AgentCompleteEvent {
  type: "complete";
  status: "review_completed";
  findings: number;
  reviewedFiles: string[];
  outcome?: string;
  unreviewedFileCount?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStructuredFileCapRefusal(input: {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
}): boolean {
  if (input.exitCode === 0 || input.exitCode === null || input.signal !== null) return false;
  const lines = input.stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return false;
  const events: Record<string, unknown>[] = [];
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return false;
    }
    if (!isRecord(parsed)) return false;
    events.push(parsed);
  }
  const error = events.at(-1);
  return error?.type === "error"
    && error.errorType === "review"
    && error.code === "too_many_files"
    && error.recoverable === false
    && error.retryable === false
    && Number.isSafeInteger(error.actualFiles)
    && Number(error.actualFiles) > 0
    && Number.isSafeInteger(error.maxFiles)
    && Number(error.maxFiles) > 0
    && events.slice(0, -1).every((event) =>
      event.type === "review_context" || event.type === "status" || event.type === "heartbeat");
}

/**
 * Select the text that identifies a finding: its fix instructions, or its review comment when the instructions are
 * absent or empty. Anything else is not a finding this contract can identify.
 */
function findingText(
  event: Record<string, unknown>,
): { codegenInstructions: string } | { comment: string } | null {
  const instructions = event.codegenInstructions;
  if (typeof instructions === "string" && instructions.trim().length > 0) {
    return { codegenInstructions: instructions.trim() };
  }
  if (instructions !== undefined && typeof instructions !== "string") return null;
  const comment = typeof event.comment === "string" ? event.comment.trim() : "";
  return comment.length > 0 ? { comment } : null;
}

function parseFindingEvent(event: Record<string, unknown>): ParsedAgentFinding | null {
  const severity = event.severity;
  const text = findingText(event);
  if (event.type !== "finding"
    || (severity !== "blocker" && severity !== "major" && severity !== "minor")
    || typeof event.fileName !== "string"
    || event.fileName.trim().length === 0
    || text === null
    || !Array.isArray(event.suggestions)) {
    return null;
  }
  return {
    contract: {
      type: "finding",
      severity,
      fileName: event.fileName.trim(),
      ...text,
      suggestions: event.suggestions,
    },
    comment: typeof event.comment === "string" ? event.comment : null,
  };
}

function parseCompleteEvent(event: Record<string, unknown>): AgentCompleteEvent | null {
  if (event.type !== "complete"
    || event.status !== "review_completed"
    || !Number.isSafeInteger(event.findings)
    || Number(event.findings) < 0
    || !Array.isArray(event.reviewedFiles)
    || event.reviewedFiles.length === 0
    || event.reviewedFiles.some((file) => typeof file !== "string" || file.trim().length === 0)
    || (event.outcome !== undefined && typeof event.outcome !== "string")
    || (event.unreviewedFileCount !== undefined
      && (!Number.isSafeInteger(event.unreviewedFileCount) || Number(event.unreviewedFileCount) < 0))) {
    return null;
  }
  return {
    type: "complete",
    status: "review_completed",
    findings: Number(event.findings),
    reviewedFiles: event.reviewedFiles.map((file) => String(file).trim()),
    ...(typeof event.outcome === "string" ? { outcome: event.outcome } : {}),
    ...(typeof event.unreviewedFileCount === "number"
      ? { unreviewedFileCount: event.unreviewedFileCount } : {}),
  };
}

/**
 * Drop generic provider guidance ahead of a finding's own instruction.
 *
 * The provider has reworded that guidance and the instruction header across releases, so the boundary is the first
 * paragraph naming the finding's file rather than any provider wording; without one, the text is kept whole.
 */
function findingInstruction(instructions: string, fileName: string): string {
  const paragraphStarts = [
    0,
    ...Array.from(instructions.matchAll(/\r?\n[\t ]*\r?\n\s*/gu), (match) => match.index + match[0].length),
  ];
  const namingStart = paragraphStarts.find((start, index) =>
    instructions.slice(start, paragraphStarts[index + 1] ?? instructions.length).includes(fileName));
  return namingStart === undefined ? instructions : instructions.slice(namingStart);
}

function normalizeFinding(event: ParsedAgentFinding, sourceOrdinal: number): NormalizedReviewFinding {
  const { contract } = event;
  return {
    findingId: canonicalDigest({
      schemaVersion: 1,
      provider: "coderabbit-cli",
      contract: CODERABBIT_AGENT_CONTRACT,
      mode: CODERABBIT_AGENT_MODE,
      finding: contract,
    }),
    severity: contract.severity === "blocker" ? "critical" : contract.severity,
    locus: contract.fileName,
    evidenceUrlOrId: "codegenInstructions" in contract
      ? findingInstruction(contract.codegenInstructions, contract.fileName)
      : contract.comment,
    sourceOrdinal,
    ...captureReviewFindingSourceLabel({ body: event.comment }),
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
  if (input.observedHead !== input.expectedHead) {
    return {
      kind: "stale-head",
      expectedHeadSha: input.expectedHead,
      observedHeadSha: input.observedHead,
    };
  }
  if (isStructuredFileCapRefusal(input)) return { kind: "capability-unsupported" };
  if (/rate limit(?:ed| exceeded)?/iu.test(`${input.stdout}\n${input.stderr}`)) {
    return { kind: "rate-limited" };
  }
  if (input.signal !== null) return { kind: "failed", reason: `process-signal:${input.signal}` };
  if (input.exitCode !== 0) {
    return { kind: "failed", reason: codeRabbitExitDiagnostic(input.exitCode, input.stderr, input.stdout) };
  }

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
      findings.push(normalizeFinding(finding, findings.length + 1));
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
  if ((complete.outcome !== undefined
      && complete.outcome !== "completed"
      && complete.outcome !== "completed_with_warnings")
    || (complete.unreviewedFileCount ?? 0) > 0) return { kind: "partial" };
  if (complete.findings !== findings.length) return { kind: "partial" };
  if (new Set(findings.map((finding) => finding.findingId)).size !== findings.length) {
    return { kind: "ambiguous" };
  }
  return findings.length === 0
    ? { kind: "clean" }
    : { kind: "findings", findings: NormalizedReviewFindingsSchema.parse(findings) };
}
