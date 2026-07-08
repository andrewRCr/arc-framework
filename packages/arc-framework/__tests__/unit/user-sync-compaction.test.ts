import { describe, expect, it } from "vitest";

import {
  adoptCompactedNotesRef,
  readNotesCompactionManifest,
} from "../../src/lib/user-sync/compaction.js";
import { NOTES_COMPACTION_MANIFEST_PATH } from "../../src/lib/user-sync/compaction-manifest.js";
import type { GitExec, GitExecInput } from "../../src/lib/git/index.js";

const NOTES_REF = "refs/notes/arc/user/andrew";
const SNAPSHOT_REF = `${NOTES_REF}__snapshot`;

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
});
