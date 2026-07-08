import { describe, expect, it } from "vitest";

import {
  adoptCompactedNotesRef,
  readNotesCompactionManifest,
} from "../../src/lib/user-sync/compaction.js";
import {
  NOTES_COMPACTION_MANIFEST_PATH,
  serializeNotesCompactionManifest,
} from "../../src/lib/user-sync/compaction-manifest.js";
import type { GitExec, GitExecInput } from "../../src/lib/git/index.js";

const NOTES_REF = "refs/notes/arc/user/andrew";
const SNAPSHOT_REF = `${NOTES_REF}__snapshot`;
const LOCAL_TIP = "1".repeat(40);
const SNAPSHOT_TIP = "2".repeat(40);

describe("notes compaction plumbing", () => {
  it("treats a missing in-band manifest as absent", async () => {
    const exec: GitExec = async () => {
      throw new Error("fatal: path not found");
    };

    await expect(readNotesCompactionManifest(exec, NOTES_REF)).resolves.toBeNull();
  });

  it("rejects a malformed in-band manifest instead of treating it as absent", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "show" && args[1] === `${NOTES_REF}:${NOTES_COMPACTION_MANIFEST_PATH}`) {
        return { stdout: "{bad json", stderr: "" };
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };

    await expect(readNotesCompactionManifest(exec, NOTES_REF))
      .rejects.toThrow("Invalid notes compaction manifest");
  });

  it("fails compaction adoption when the fetched snapshot manifest is malformed", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "show" && args[1] === `${SNAPSHOT_REF}:${NOTES_COMPACTION_MANIFEST_PATH}`) {
        return { stdout: "{bad json", stderr: "" };
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };
    const execInput: GitExecInput = async () => {
      throw new Error("unexpected stdin git call");
    };

    const result = await adoptCompactedNotesRef({
      exec,
      execInput,
      fullRef: NOTES_REF,
      snapshotRef: SNAPSHOT_REF,
    });

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error.message).toContain("Invalid notes compaction manifest");
  });

  it("returns a typed ref-moved outcome when the final adopt CAS loses", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "show" && args[1] === `${SNAPSHOT_REF}:${NOTES_COMPACTION_MANIFEST_PATH}`) {
        return {
          stdout: serializeNotesCompactionManifest({
            version: 1,
            generation: 1,
            preCompactionTip: LOCAL_TIP,
            pruned: [],
          }),
          stderr: "",
        };
      }
      if (args[0] === "show" && args[1] === `${NOTES_REF}:${NOTES_COMPACTION_MANIFEST_PATH}`) {
        throw new Error("fatal: path not found");
      }
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        if (args[2] === NOTES_REF) return { stdout: `${LOCAL_TIP}\n`, stderr: "" };
        if (args[2] === SNAPSHOT_REF || String(args[2]).includes("__compact_adopt_")) {
          return { stdout: `${SNAPSHOT_TIP}\n`, stderr: "" };
        }
      }
      if (args[0] === "notes" && args[2] === "list") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "update-ref" && args[1] === NOTES_REF) {
        throw new Error(`cannot lock ref '${NOTES_REF}': is at ${"3".repeat(40)} but expected ${LOCAL_TIP}`);
      }
      if (args[0] === "update-ref") {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };
    const execInput: GitExecInput = async () => {
      throw new Error("unexpected stdin git call");
    };

    const result = await adoptCompactedNotesRef({
      exec,
      execInput,
      fullRef: NOTES_REF,
      snapshotRef: SNAPSHOT_REF,
    });

    expect(result.kind).toBe("ref-moved");
    if (result.kind === "ref-moved") {
      expect(result.error.message).toContain("expected");
    }
  });
});
