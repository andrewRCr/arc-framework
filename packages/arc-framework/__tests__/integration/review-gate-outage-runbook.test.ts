import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

const runbookPath = resolve(import.meta.dirname, "../../../../.github/review-gate.md");
const rehearsalPath = resolve(import.meta.dirname, "../../../../.github/review-gate-repair-rehearsal.json");
let outage = "";

function positions(...phrases: string[]): number[] {
  return phrases.map((phrase) => outage.indexOf(phrase));
}

describe("review-gate outage runbook contract", () => {
  beforeAll(async () => {
    const runbook = await readFile(runbookPath, "utf8");
    const outageStart = runbook.indexOf("## Audited App or Controller Outage Recovery");
    if (outageStart < 0) throw new Error("outage recovery section is missing from the review-gate runbook");
    outage = runbook.slice(outageStart);
  });

  it("uses only the immutable default-branch repository-dispatch path", () => {
    expect(outage).toContain("`repository_dispatch`");
    expect(outage).toContain('event_type:"review-gate-repair"');
    expect(outage).not.toContain("`workflow_dispatch`");
  });

  it("orders outage proof and addition before removal", () => {
    const steps = positions(
      "Freeze merges operationally.",
      "Prove source-pinned CI",
      "Dispatch the typed event",
      "Form an augmented non-empty array",
      "Only after the augmented checkpoint passes",
    );
    expect(steps.every((position) => position >= 0)).toBe(true);
    expect(steps).toEqual([...steps].sort((left, right) => left - right));
  });

  it("orders restored App proof before emergency-context removal", () => {
    const steps = positions(
      "Produce the restored App context",
      "add the restored App context",
      "remove `review-repair-ok`",
    );
    expect(steps.every((position) => position >= 0)).toBe(true);
    expect(steps).toEqual([...steps].sort((left, right) => left - right));
  });

  it("retains sanitized shadow-rehearsal evidence and forbids bypasses", () => {
    expect(outage).toContain("legacy CI still required");
    expect(outage).toContain("checkpoint hashes");
    expect(outage).toContain("admin bypass");
    expect(outage).toContain("removal-first mutation");
    expect(outage).toContain("CI-producer self-proof");
  });

  it("retains the non-mutating shadow contract rehearsal in exact order", async () => {
    const rehearsal = JSON.parse(await readFile(rehearsalPath, "utf8")) as Record<string, unknown>;
    expect(rehearsal).toMatchObject({
      schemaVersion: 1,
      scope: "non-mutating",
      containsLiveValues: false,
      existingAuthorityRequiredThroughout: true,
      result: "passed",
    });
    expect(rehearsal.steps).toEqual([
      "freeze",
      "prove-existing-ci",
      "validate-attestation",
      "compare-environment",
      "audit-exclusive-writer",
      "dispatch-default-branch",
      "prove-repair-status",
      "add-repair-context",
      "prove-augmented-set",
      "remove-repair-context",
      "prove-restored-set",
    ]);
  });
});
