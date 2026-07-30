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
});
