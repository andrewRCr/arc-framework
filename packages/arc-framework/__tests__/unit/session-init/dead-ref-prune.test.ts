/**
 * Unit tests for the standalone dead-ref prune — the session-init hygiene
 * backstop that drops remote-tracking refs whose upstream was deleted
 * out-of-session (a reviewed-lane errand PR merged + auto-delete-head). It is
 * decoupled from classification: the oracle is prune-independent, so this is
 * cleanliness only and must never throw.
 */

import { describe, it, expect, vi } from "vitest";

import { pruneRemoteTrackingRefs } from "../../../src/lib/session-init/dead-ref-prune.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

describe("pruneRemoteTrackingRefs", () => {
  it("issues a `git fetch --prune origin`", async () => {
    const exec: GitExec = vi.fn(async () => ({ stdout: "", stderr: "" }));

    await pruneRemoteTrackingRefs(exec);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith("git", ["fetch", "--prune", "origin"]);
  });

  it("swallows a failed fetch (offline / no remote) without throwing", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("could not resolve host");
    });

    await expect(pruneRemoteTrackingRefs(exec)).resolves.toBeUndefined();
  });
});
