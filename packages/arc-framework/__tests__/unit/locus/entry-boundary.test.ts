/** Directed-command advisory and checkout-pinned execution tests. */

import { describe, expect, it } from "vitest";

import {
  appendDirectedCommandAdvisory,
  pinLocusGitExec,
} from "../../../src/lib/locus/entry-boundary.js";
import type { LocusMutationResultV1 } from "../../../src/lib/locus/schema/index.js";

const SUCCESS: Extract<LocusMutationResultV1, { outcome: "applied" | "idempotent" }> = {
  outcome: "applied",
  operation: "locus-attach",
  allocation: { kind: "spawned", checkoutPath: "/work/transient" },
  recordId: `sha256:${"a".repeat(64)}`,
  leaseId: "b".repeat(32),
  activeLocusPath: "/work/transient",
  sessionHomePath: "/work/session-home",
  identity: null,
  originEntry: null,
  restoredParent: null,
  nextOffer: null,
  recommendedPromptText: "Continue in /work/transient.",
};

describe("appendDirectedCommandAdvisory", () => {
  it("keeps a separate active checkout admitted and adds operator-confirmed direction guidance", () => {
    const result = appendDirectedCommandAdvisory(SUCCESS);
    expect(result).toMatchObject({ outcome: "applied", operation: "locus-attach" });
    expect(result.recommendedPromptText).toContain("Continue in /work/transient.");
    expect(result.recommendedPromptText).toMatch(/confirm.*direct commands.*active (?:checkout|locus)/iu);
    expect(result.recommendedPromptText).toMatch(/cold session/iu);
  });

  it("does not add a direction advisory when the session is already in the active checkout", () => {
    const colocated = { ...SUCCESS, sessionHomePath: SUCCESS.activeLocusPath };
    expect(appendDirectedCommandAdvisory(colocated)).toStrictEqual(colocated);
  });

  it("can require confirmation for a directed attach even when the result re-roots session home", () => {
    const attached = { ...SUCCESS, operation: "locus-attach" as const, sessionHomePath: SUCCESS.activeLocusPath };
    expect(appendDirectedCommandAdvisory(attached, { confirmationRequired: true }).recommendedPromptText)
      .toMatch(/confirm.*direct commands/iu);
  });
});

describe("pinLocusGitExec", () => {
  it("pins directed Git work to the active locus", async () => {
    const result = appendDirectedCommandAdvisory(SUCCESS);
    if (result.outcome === "refused" || result.outcome === "error") throw new Error("expected open success");
    expect(result.activeLocusPath).toBe("/work/transient");
    expect(result.sessionHomePath).toBe("/work/session-home");
    if (result.activeLocusPath === null || result.sessionHomePath === null) {
      throw new Error("expected directed open paths");
    }

    const calls: unknown[][] = [];
    const exec = pinLocusGitExec(async (...args) => {
      calls.push(args);
      return { stdout: "" };
    }, result.activeLocusPath);
    await exec("git", ["status", "--short"], { cwd: "/ambient/caller", indexFile: "/tmp/index" });

    expect(calls).toEqual([[
      "git",
      ["status", "--short"],
      { cwd: "/work/transient", indexFile: "/tmp/index" },
    ]]);
  });
});
