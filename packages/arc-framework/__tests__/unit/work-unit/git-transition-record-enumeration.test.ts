import { describe, expect, it } from "vitest";

import type { RawGitExec } from "../../../src/lib/change-facts.js";
import { enumerateGitTransitionRecords } from "../../../src/lib/work-unit/git-transition-record-enumeration.js";
import { serializeTransitionRecord } from "../../../src/lib/work-unit/transition-record.js";
import { TRANSITION_RECORD_NAMESPACE } from "../../../src/lib/work-unit/transition-record-store.js";

const encoder = new TextEncoder();

function treeLine(oid: string, filename: string): Uint8Array {
  return encoder.encode(`100644 blob ${oid}\t${TRANSITION_RECORD_NAMESPACE}/${filename}\0`);
}

function selectedRefExec(): RawGitExec {
  const selectedOid = "a".repeat(40);
  const otherOid = "b".repeat(40);
  const selected = serializeTransitionRecord({
    schemaVersion: 1,
    origin: "selected",
    kind: "abandon",
    successors: [],
    edges: [],
  });
  const other = serializeTransitionRecord({
    schemaVersion: 1,
    origin: "other",
    kind: "abandon",
    successors: [],
    edges: [],
  });
  return async (args) => {
    if (args[0] === "ls-tree") {
      return {
        stdout: args.includes("refs/heads/selected")
          ? treeLine(selectedOid, "selected.json")
          : treeLine(otherOid, "other.json"),
      };
    }
    if (args[0] === "cat-file" && args[2] === selectedOid) {
      return { stdout: encoder.encode(selected) };
    }
    if (args[0] === "cat-file" && args[2] === otherOid) {
      return { stdout: encoder.encode(other) };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
}

describe("Git transition record enumeration", () => {
  it("resolves records only from the requested ref", async () => {
    await expect(enumerateGitTransitionRecords(
      selectedRefExec(),
      "refs/heads/selected",
    )).resolves.toEqual({
      status: "valid",
      groups: [{
        origin: "selected",
        records: [{
          schemaVersion: 1,
          origin: "selected",
          kind: "abandon",
          successors: [],
          edges: [],
        }],
      }],
    });
  });

  it("ignores unreachable malformed bytes but poisons the selected tree", async () => {
    const validOid = "c".repeat(40);
    const malformedOid = "d".repeat(40);
    const valid = serializeTransitionRecord({
      schemaVersion: 1,
      origin: "reachable",
      kind: "abandon",
      successors: [],
      edges: [],
    });
    const exec: RawGitExec = async (args) => {
      if (args[0] === "ls-tree") {
        return {
          stdout: args.includes("refs/heads/selected")
            ? treeLine(validOid, "reachable.json")
            : treeLine(malformedOid, "malformed.json"),
        };
      }
      if (args[0] === "cat-file" && args[2] === validOid) {
        return { stdout: encoder.encode(valid) };
      }
      if (args[0] === "cat-file" && args[2] === malformedOid) {
        return { stdout: Uint8Array.from([0xc3, 0x28]) };
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };

    await expect(enumerateGitTransitionRecords(exec, "refs/heads/selected"))
      .resolves.toMatchObject({ status: "valid" });
    await expect(enumerateGitTransitionRecords(exec, "refs/heads/selected-malformed"))
      .resolves.toEqual({ status: "namespace-corrupt", filename: "malformed.json" });
  });
});
