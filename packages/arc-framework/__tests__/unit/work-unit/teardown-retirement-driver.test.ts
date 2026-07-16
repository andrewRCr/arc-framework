import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import type { ManagedPath } from "../../../src/lib/canonical/managed-path.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { WorktreeHuskStamp } from "../../../src/lib/git/worktree-marker.js";
import {
  createGitRetirementAuthorizationContext,
  readCompletedProjectionDigest,
} from "../../../src/lib/work-unit/git-retirement-authorization-context.js";
import {
  revalidateHuskRetirementEvidence,
  type TeardownBlobReader,
} from "../../../src/lib/work-unit/teardown-retirement-driver.js";
import type { TeardownAuthorizationDecision } from "../../../src/lib/work-unit/retirement-authority.js";

const baseOid = "b".repeat(40);
const branch = "feat/sample";
const metaPath = ".arc/completed/2026-q3/01_sample/meta-sample.md";
const specPath = ".arc/completed/2026-q3/01_sample/spec-sample.md";
const meta = renderMetaFile("sample", { State: "Shipped", Branch: "[none]" });
const blobs = new Map<string, Uint8Array>([
  [metaPath, new TextEncoder().encode(meta)],
  [specPath, new TextEncoder().encode("# Sample\n")],
]);

function execWithCompletedProjection(options: { ancestry?: boolean; includeProjection?: boolean } = {}): GitExec {
  const ancestry = options.ancestry ?? true;
  const includeProjection = options.includeProjection ?? true;
  return async (_cmd, args) => {
    if (args[0] === "merge-base") {
      if (!ancestry) throw new Error("not ancestor");
      return { stdout: "" };
    }
    if (args[0] === "ls-tree") {
      return { stdout: includeProjection ? `${metaPath}\0${specPath}\0` : "" };
    }
    if (args[0] === "show" && args[1] === `main:${metaPath}`) return { stdout: meta };
    if (args[0] === "rev-parse" && args.includes("origin/feat/sample")) throw new Error("no upstream");
    if (args[0] === "rev-parse") return { stdout: `${baseOid}\n` };
    if (args[0] === "cherry") return { stdout: "" };
    throw new Error(`unexpected git command: ${args.join(" ")}`);
  };
}

const readBlob: TeardownBlobReader = async (_ref, path: ManagedPath) => blobs.get(path) ?? null;

const stamp: WorktreeHuskStamp = {
  sha: "a".repeat(40),
  at: "2026-07-16T00:00:00.000Z",
  subject: { kind: "work-unit", name: "sample" },
  branch,
};

function proof(resultDigest: `sha256:${string}`): Extract<TeardownAuthorizationDecision, { status: "authorized" }> {
  return {
    status: "authorized",
    authorization: "merged-preserved",
    authorityVersion: "version",
    evidence: {
      kind: "shipped",
      expectedLifecycle: "completed",
      resultDigest,
      baseProofOid: baseOid,
    },
    refs: { localOid: stamp.sha, remote: null },
  };
}

describe("shipped teardown retirement evidence", () => {
  it("does not authorize when the completed projection is missing", async () => {
    const context = createGitRetirementAuthorizationContext(
      execWithCompletedProjection({ includeProjection: false }),
      "main",
      readBlob,
    );
    await expect(context.readShippedEvidence({
      subject: stamp.subject,
      branch,
      head: stamp.sha,
      remote: "origin",
      requestedMode: "shipped",
    })).resolves.toBeNull();
  });

  it("revalidates the same exact completed artifact-group digest", async () => {
    const exec = execWithCompletedProjection();
    const digest = await readCompletedProjectionDigest(exec, "main", stamp.subject, readBlob);
    expect(digest).not.toBeNull();
    if (digest === null) return;

    await expect(revalidateHuskRetirementEvidence(exec, stamp, proof(digest), "main", readBlob)).resolves.toBe(true);
    await expect(revalidateHuskRetirementEvidence(
      execWithCompletedProjection({ ancestry: false }),
      stamp,
      proof(digest),
      "main",
      readBlob,
    )).resolves.toBe(true);
  });

  it("fails closed when the completed projection cannot be read", async () => {
    const exec = execWithCompletedProjection();
    const unreadable: TeardownBlobReader = async () => { throw new Error("blob unavailable"); };
    await expect(revalidateHuskRetirementEvidence(
      exec,
      stamp,
      proof(`sha256:${"c".repeat(64)}`),
      "main",
      unreadable,
    )).resolves.toBe(false);
  });
});
