import { describe, expect, it } from "vitest";

import { parseReviewCommand } from "../../../../../src/scripts/review-gate/core/commands.js";

const context = {
  knownRequirementIds: ["analysis", "security"],
  knownFindings: [{ sourceIdentity: "agent-1", findingId: "finding-1" }],
  allowedSourceIdentities: ["agent-1", "agent-2"],
};

describe("host-neutral review commands", () => {
  it.each([
    ["/review-gate require analysis investigate this change", "require"],
    ["/review-gate waive analysis accepted operational risk", "waive"],
    ["/review-gate refresh analysis agent-1 incremental review the delta", "refresh"],
  ])("parses %s without shell interpretation", (text, kind) => {
    const result = parseReviewCommand(text, context);
    expect(result).toMatchObject({ ok: true, command: { kind } });
    if (result.ok) expect(result.command.reason.length).toBeGreaterThan(0);
  });

  it("preserves metacharacters as reason text", () => {
    const result = parseReviewCommand("/review-gate require analysis inspect $(touch nope); still text", context);
    expect(result).toMatchObject({
      ok: true,
      command: { reason: "inspect $(touch nope); still text" },
    });
  });

  it.each([
    ["unknown command", "/review-gate resolve analysis because"],
    ["implicit waive all", "/review-gate waive all because"],
    ["unknown requirement", "/review-gate require missing because"],
    ["legacy dismissal", "/review-gate dismiss analysis agent-1 finding-1 because"],
    ["invalid coverage", "/review-gate refresh analysis agent-1 partial because"],
    ["control", "/review-gate require analysis bad\nreason"],
    ["trailing ambiguity", "/review-gate refresh analysis agent-1 full"],
  ])("rejects %s", (_name, text) => {
    expect(parseReviewCommand(text, context).ok).toBe(false);
  });

  it("enforces command and final-reason byte limits", () => {
    expect(parseReviewCommand(`/review-gate require analysis ${"x".repeat(1025)}`, context).ok).toBe(false);
    expect(parseReviewCommand(`/review-gate require analysis ${"é".repeat(2035)}`, context).ok).toBe(false);
  });
});
