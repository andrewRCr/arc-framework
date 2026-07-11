/** Strict source-neutral command language for review-gate mutations. */

import { REVIEW_IDENTIFIER } from "./validation.js";

/** Parsed review command. */
export type ReviewCommand =
  | { kind: "require"; requirementId: string; reason: string }
  | { kind: "waive"; requirementId: string; reason: string }
  | {
      kind: "refresh";
      requirementId: string;
      sourceIdentity: string;
      coverage: "full" | "incremental";
      reason: string;
    }
  | {
      kind: "dismiss";
      requirementId: string;
      sourceIdentity: string;
      findingId: string;
      reason: string;
    };

/** Known identifiers used to reject semantically impossible commands early. */
export interface ReviewCommandContext {
  knownRequirementIds: string[];
  knownFindings: Array<{ sourceIdentity: string; findingId: string }>;
  allowedSourceIdentities: string[];
}

/** Categorized command parse failure. */
export interface ReviewCommandError {
  code: string;
  message: string;
}

/** Parse result with actionable diagnostics. */
export type ReviewCommandParseResult =
  | { ok: true; command: ReviewCommand }
  | { ok: false; error: ReviewCommandError };

function failure(code: string, message: string): ReviewCommandParseResult {
  return { ok: false, error: { code, message } };
}

function reasonValid(reason: string): boolean {
  return reason.length > 0 && Buffer.byteLength(reason, "utf8") <= 1024;
}

/** Parse one command without tokenizing or evaluating shell syntax. */
export function parseReviewCommand(text: string, context: ReviewCommandContext): ReviewCommandParseResult {
  if (Buffer.byteLength(text, "utf8") > 4096) return failure("command-too-large", "command exceeds 4096 bytes");
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 32 || code === 127) return failure("control-character", "command contains an ASCII control character");
  }

  const requireMatch = /^\/review-gate (require|waive) (\S+) (.+)$/u.exec(text);
  if (requireMatch !== null) {
    const kind = requireMatch[1] as "require" | "waive";
    const requirementId = requireMatch[2] ?? "";
    const reason = (requireMatch[3] ?? "").trim();
    if (!REVIEW_IDENTIFIER.test(requirementId)) return failure("invalid-requirement", "requirement id is malformed");
    if (!context.knownRequirementIds.includes(requirementId)) {
      return failure("unknown-requirement", `unknown requirement: ${requirementId}`);
    }
    if (!reasonValid(reason)) return failure("invalid-reason", "reason must contain 1-1024 bytes");
    return { ok: true, command: { kind, requirementId, reason } };
  }

  const refreshMatch = /^\/review-gate refresh (\S+) (\S+) (\S+) (.+)$/u.exec(text);
  if (refreshMatch !== null) {
    const requirementId = refreshMatch[1] ?? "";
    const sourceIdentity = refreshMatch[2] ?? "";
    const coverage = refreshMatch[3] ?? "";
    const reason = (refreshMatch[4] ?? "").trim();
    if (!context.knownRequirementIds.includes(requirementId)) {
      return failure("unknown-requirement", `unknown requirement: ${requirementId}`);
    }
    if (
      !REVIEW_IDENTIFIER.test(sourceIdentity)
      || (sourceIdentity !== "auto" && !context.allowedSourceIdentities.includes(sourceIdentity))
    ) return failure("unknown-source", `source is not allowed: ${sourceIdentity}`);
    if (coverage !== "full" && coverage !== "incremental") {
      return failure("invalid-coverage", "coverage must be full or incremental");
    }
    if (!reasonValid(reason)) return failure("invalid-reason", "reason must contain 1-1024 bytes");
    return {
      ok: true,
      command: { kind: "refresh", requirementId, sourceIdentity, coverage, reason },
    };
  }

  const dismissMatch = /^\/review-gate dismiss (\S+) (\S+) (\S+) (.+)$/u.exec(text);
  if (dismissMatch !== null) {
    const requirementId = dismissMatch[1] ?? "";
    const sourceIdentity = dismissMatch[2] ?? "";
    const findingId = dismissMatch[3] ?? "";
    const reason = (dismissMatch[4] ?? "").trim();
    if (!context.knownRequirementIds.includes(requirementId)) {
      return failure("unknown-requirement", `unknown requirement: ${requirementId}`);
    }
    if (![sourceIdentity, findingId].every((value) => REVIEW_IDENTIFIER.test(value))) {
      return failure("invalid-finding", "source or finding identity is malformed");
    }
    if (!context.knownFindings.some((finding) =>
      finding.sourceIdentity === sourceIdentity && finding.findingId === findingId)) {
      return failure("unknown-finding", `unknown source-scoped finding: ${sourceIdentity}/${findingId}`);
    }
    if (!reasonValid(reason)) return failure("invalid-reason", "reason must contain 1-1024 bytes");
    return {
      ok: true,
      command: { kind: "dismiss", requirementId, sourceIdentity, findingId, reason },
    };
  }
  return failure("invalid-command", "command does not match require, waive, refresh, or dismiss grammar");
}
