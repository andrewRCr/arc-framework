/** Directed-command capability and warm locus-entry boundary tests. */

import { describe, expect, it } from "vitest";

import {
  enteringProcessCapabilities,
  guardWarmLocusEntry,
  pinLocusGitExec,
} from "../../../src/lib/locus/entry-boundary.js";
import type { LocusAnchor, LocusMutationResultV1 } from "../../../src/lib/locus/schema/index.js";

function processAnchor(selector: string): LocusAnchor {
  return { kind: "process", pid: 42, startToken: "start", inspector: "linux-proc", selector };
}

const SUCCESS: LocusMutationResultV1 = {
  outcome: "applied",
  operation: "errand-open",
  allocation: { kind: "spawned", checkoutPath: "/work/transient" },
  recordId: `sha256:${"a".repeat(64)}`,
  leaseId: "b".repeat(32),
  activeLocusPath: "/work/transient",
  sessionHomePath: "/work/session-home",
  identity: null,
  originEntry: null,
  dispatchId: null,
  routingPlanDigest: null,
  restoredParent: null,
  nextOffer: null,
  recommendedPromptText: "Continue in /work/transient.",
};

describe("enteringProcessCapabilities", () => {
  it.each(["codex", "claude"])("admits the %s selector for directed warm entry", (selector) => {
    expect(enteringProcessCapabilities(processAnchor(selector))).toEqual({ directedCommands: true });
  });

  it.each(["gemini", "interactive-shell", "shared-host", "unknown"])(
    "does not admit the %s selector for directed warm entry",
    (selector) => {
      expect(enteringProcessCapabilities(processAnchor(selector))).toEqual({ directedCommands: false });
    },
  );

  it("does not admit an unverifiable entering anchor", () => {
    expect(enteringProcessCapabilities({ kind: "unverifiable", reason: "ancestry unavailable" }))
      .toEqual({ directedCommands: false });
  });
});

describe("guardWarmLocusEntry", () => {
  it("refuses before identity or local allocation mutation when directed commands are unavailable", async () => {
    let mutations = 0;
    const result = await guardWarmLocusEntry({
      anchor: processAnchor("interactive-shell"),
      operation: "errand-open",
      mutate: async () => {
        mutations += 1;
        return SUCCESS;
      },
    });

    expect(result).toMatchObject({
      outcome: "refused",
      operation: "errand-open",
      reason: "cold-entry-required",
    });
    expect(result.recommendedPromptText).toMatch(/fresh (?:Codex|Claude)|cold session/iu);
    expect(mutations).toBe(0);
  });

  it("returns successful path coordinates and pins directed Git work to the active locus", async () => {
    const result = await guardWarmLocusEntry({
      anchor: processAnchor("codex"),
      operation: "errand-open",
      mutate: async () => SUCCESS,
    });
    expect(result).toStrictEqual(SUCCESS);
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
