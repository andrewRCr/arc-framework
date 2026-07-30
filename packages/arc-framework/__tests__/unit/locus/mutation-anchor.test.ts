/** Mutation-anchor composition coverage. */

import { describe, expect, it } from "vitest";

import { selectLocusMutationAnchor } from "../../../src/lib/locus/mutation-anchor.js";
import type {
  ProcessAncestryInspector,
  ProcessInspector,
} from "../../../src/lib/locus/process-inspector.js";

describe("locus mutation anchor", () => {
  it("selects the session anchor through the caller-supplied ancestry boundary", async () => {
    const ancestry: ProcessAncestryInspector = {
      kind: "fixture-ancestry",
      inspectAncestor: async (pid) => ({
        kind: "present",
        snapshot: {
          pid,
          parentPid: 1,
          startToken: "session-start",
          commandIdentity: "codex",
          commandArguments: ["codex"],
        },
      }),
    };
    const command: ProcessInspector = {
      kind: "fixture-command",
      inspect: async () => {
        throw new Error("command fallback should not run");
      },
    };

    await expect(selectLocusMutationAnchor(command, "Mutation anchor unavailable", ancestry))
      .resolves.toEqual({
        kind: "process",
        pid: process.pid,
        startToken: "session-start",
        inspector: "fixture-ancestry",
        selector: "codex",
      });
  });

  it("falls back to the command process when ancestry is unverifiable", async () => {
    const ancestry: ProcessAncestryInspector = {
      kind: "fixture-ancestry",
      inspectAncestor: async () => ({ kind: "unverifiable", reason: "no ancestry" }),
    };
    const command: ProcessInspector = {
      kind: "fixture-command",
      inspect: async (pid) => ({
        kind: "present",
        pid,
        parentPid: 1,
        startToken: "command-start",
        commandIdentity: "node",
      }),
    };

    await expect(selectLocusMutationAnchor(command, "Mutation anchor unavailable", ancestry))
      .resolves.toEqual({
        kind: "process",
        pid: process.pid,
        startToken: "command-start",
        inspector: "fixture-command",
        selector: "arc-command",
      });
  });

  it("reports both failed anchor boundaries", async () => {
    const ancestry: ProcessAncestryInspector = {
      kind: "fixture-ancestry",
      inspectAncestor: async () => ({ kind: "unverifiable", reason: "no ancestry" }),
    };
    const command: ProcessInspector = {
      kind: "fixture-command",
      inspect: async () => ({ kind: "unverifiable", reason: "no command snapshot" }),
    };

    await expect(selectLocusMutationAnchor(command, "Mutation anchor unavailable", ancestry))
      .rejects.toThrow(
        "Mutation anchor unavailable: no ancestry (command fallback: no command snapshot)",
      );
  });
});
