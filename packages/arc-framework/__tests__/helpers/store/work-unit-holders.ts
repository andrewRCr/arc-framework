/** Real markers distinguish completed and live owners over checked operational records. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { onTestFinished } from "vitest";
import { createLocusPorts } from "../../../src/lib/locus/lifecycle-ports.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { createLifecycleHarness } from "./lifecycle-harness.js";
import { boundWorkUnitSubject } from "./bound-checkout.js";

export async function workUnitHoldersFixture() {
  const cwd = await mkdtemp(join(tmpdir(), "holder-generations-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  const oldPath = join(cwd, "old"), livePath = join(cwd, "live");
  await mkdir(oldPath); await mkdir(livePath);
  const h = createLifecycleHarness();
  const archived = await h.seedMeta("demo", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design" });
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "for-each-ref" || args[0] === "remote") return { stdout: "" };
    if (args[0] !== "worktree") throw new Error(`Unexpected Git ${args.join(" ")}`);
    return { stdout: [cwd, oldPath, livePath].map((path, index) =>
      `worktree ${path}\0HEAD ${"a".repeat(40)}\0${index === 0 ? "branch refs/heads/main" : "detached"}\0\0`).join("") };
  };
  const ports = createLocusPorts({ cwd, exec, store: h.store });
  const write = (path: string, createdFor: ReturnType<typeof boundWorkUnitSubject> | { kind: "work-unit"; name: string }) =>
    writeWorktreeMarker(path, { spawnedByArc: false, createdFor, spawningIdentity: "test-user", createdAt: new Date(0).toISOString() });
  await write(oldPath, boundWorkUnitSubject(archived));
  return { ...h, cwd, oldPath, livePath, archived, live, ports, write, exec };
}
