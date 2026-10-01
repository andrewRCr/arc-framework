/** Delivery correction must bind release helper Git reads to its own executor. */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it, vi } from "vitest";

import { cleanupTempDir, createTempRepo } from "../../helpers/integration.js";
import { createDeliveryReviewFixReleaseEffectPorts } from
  "../../../src/handlers/delivery-review-fix-release-effects.js";
import { createGitExec } from "../../../src/lib/io-context.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const observed = vi.hoisted(() => ({ snapshotPath: "" }));

vi.mock("../../../src/handlers/release/commit.js", () => ({
  runReleaseCommit: async (deps: {
    cwd: string;
    createMessageSnapshot: (input: { cwd: string; bytes: Uint8Array }) =>
      Promise<{ path: string; cleanup: () => Promise<void> }>;
  }) => {
    const snapshot = await deps.createMessageSnapshot({
      cwd: deps.cwd,
      bytes: Buffer.from("delivery correction"),
    });
    observed.snapshotPath = snapshot.path;
    await snapshot.cleanup();
    return { exitCode: 1 };
  },
}));

let repository = "";
let alternate = "";

afterEach(async () => {
  if (repository !== "") await cleanupTempDir(repository);
  if (alternate !== "") await cleanupTempDir(alternate);
  observed.snapshotPath = "";
  repository = "";
  alternate = "";
});

it("routes delivery's message snapshot through the delivery executor", async () => {
  repository = await createTempRepo("arc-delivery-bound-message-");
  alternate = await mkdtemp(join(tmpdir(), "arc-delivery-git-dir-"));
  const baseExec = createGitExec();
  const exec: GitExec = (command, args, options) =>
    args.includes("--absolute-git-dir")
      ? Promise.resolve({ stdout: `${alternate}\n` })
      : baseExec(command, args, options);

  const ports = createDeliveryReviewFixReleaseEffectPorts({
    cwd: repository,
    remote: "origin",
    identity: "alice",
    exec,
  });
  const result = await ports.commit({ paths: ["record.json"], message: "correction" });

  expect(result.status).toBe("refused");
  expect(observed.snapshotPath.startsWith(`${alternate}/`)).toBe(true);
});
