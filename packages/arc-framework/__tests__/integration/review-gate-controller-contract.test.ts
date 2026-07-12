import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ReviewRequirement } from "../../src/scripts/review-gate/core/contracts.js";
import type { GateVerdictInput } from "../../src/scripts/review-gate/core/verdict.js";
import { reduceGateVerdict } from "../../src/scripts/review-gate/core/verdict.js";
import { discoverCandidates } from "../../src/scripts/review-gate/runtime/discovery.js";

const REVIEW_GATE_ROOT = fileURLToPath(new URL("../../src/scripts/review-gate", import.meta.url));

function source(relativePath: string): string {
  return readFileSync(join(REVIEW_GATE_ROOT, relativePath), "utf8");
}

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? typescriptFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}

function requirement(obligation: "required" | "recommended"): ReviewRequirement {
  return {
    schemaVersion: 1, id: "analysis", kind: "independent-analysis", obligation,
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }], count: 1,
    initialAdmission: "automatic", policyVersion: "a".repeat(64), rubricVersion: "independent-analysis/v1",
    reasons: ["code-surface"], changeSetId: "b".repeat(64), headSha: "c".repeat(40),
  };
}

function input(
  obligation: "required" | "recommended" | "exempt",
  state: GateVerdictInput["requirements"][number]["state"] = "clean",
  inconsistencies: string[] = [],
): GateVerdictInput {
  return {
    readiness: { draft: false, mergeability: "mergeable", enforceBaseFreshness: true, baseFresh: true },
    ci: { state: "success" },
    requirements: obligation === "exempt" ? [] : [{ requirement: requirement(obligation), state, sourceIdentity: "agent-1" }],
    nativeReview: { requestedChanges: false, unresolvedRequiredConversations: 0, decision: "not-configured" },
    inconsistencies,
  };
}

describe("integrated review-gate contract", () => {
  it("keeps neutral core modules independent of repository policy and GitHub implementations", () => {
    const forbiddenImport = /from\s+["'][^"']*(?:policy\/self-hosting|hosts\/github|providers\/)[^"']*["']/u;
    const violations = typescriptFiles(join(REVIEW_GATE_ROOT, "core"))
      .filter((path) => forbiddenImport.test(readFileSync(path, "utf8")));
    expect(violations).toEqual([]);
  });

  it("retains one request, receipt, and envelope contract behind the parsing facade", () => {
    const declarations = typescriptFiles(REVIEW_GATE_ROOT).flatMap((path) => {
      const content = readFileSync(path, "utf8");
      return ["ReviewRequest", "ReviewReceipt", "ReceiptEnvelope"]
        .filter((name) => content.includes(`export interface ${name} {`))
        .map((name) => `${name}:${path}`);
    });
    expect(declarations).toEqual([
      `ReviewRequest:${join(REVIEW_GATE_ROOT, "core/execution.ts")}`,
      `ReviewReceipt:${join(REVIEW_GATE_ROOT, "core/execution.ts")}`,
      `ReceiptEnvelope:${join(REVIEW_GATE_ROOT, "core/execution.ts")}`,
    ]);
    expect(source("hosts/github/receipt-comment.ts")).toContain("parseReceiptEnvelope");
    expect(source("core/ports.ts")).toContain('from "./execution.js"');
    expect(source("core/receipt-ledger.ts")).toContain('from "./execution.js"');
  });

  it.each([
    ["exempt", "clean", [], "success"],
    ["recommended", "unavailable", [], "success"],
    ["required", "clean", [], "success"],
    ["required", "findings", [], "failure"],
    ["required", "stale", [], "pending"],
    ["required", "waived", [], "success"],
    ["required", "clean", ["malformed-receipt"], "failure"],
    ["required", "clean", ["invalid-capacity"], "failure"],
  ] as const)("projects %s/%s with %j as %s", (obligation, state, inconsistencies, conclusion) => {
    expect(reduceGateVerdict(input(obligation, state, [...inconsistencies])).conclusion).toBe(conclusion);
  });

  it("cannot turn missing or spoofed required evidence green", () => {
    expect(reduceGateVerdict(input("required", "not-requested")).conclusion).toBe("pending");
    expect(reduceGateVerdict(input("required", "clean", ["malformed-receipt"])).conclusion).toBe("failure");
  });

  it("converges event and scheduled entry on the same candidate set", async () => {
    const port = {
      resolveOpenPullRequestsByHead: async () => [7],
      listOpenPullRequests: async function* () { yield [7]; },
    };
    const event = await discoverCandidates({
      kind: "status", repositoryId: 42, pullRequestNumbers: [], headSha: "c".repeat(40), workflowName: null,
    }, port);
    const schedule = await discoverCandidates({
      kind: "schedule", repositoryId: 42, pullRequestNumbers: [], headSha: null, workflowName: null,
    }, port);
    expect(event).toEqual(schedule);
  });
});
