/** Native attestation of a paused work unit refuses toward resume and attests once resumed. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { AttestCommandInputSchema, attestCandidateWithReviewBoundary } from "../../src/handlers/lifecycle-delivery-review.js";
import { writeMetaPause } from "../../src/lib/store/kinds/meta/writers.js";
import { runResumePaused } from "../../src/lib/work-unit/verbs/pause-handover.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

it("refuses a paused work unit naming arc resume without writing, then attests after resume", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\narchive.cadence: manual\n");
  await exec("git", ["config", "arc.identity", "test-user"], { cwd });
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["commit", "-m", "Configure fixture"], { cwd });
  await exec("git", ["switch", "-c", "topic/opaque"], { cwd });
  await writeFile(join(cwd, "example.ts"), "export const example = true;\n");
  await exec("git", ["add", "example.ts"], { cwd });
  await exec("git", ["commit", "-m", "Implement example"], { cwd });
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.reference.seedProject(projectId);
  const primary = await h.reference.seedMeta("example", { branch: null, state: "Active",
    taskList: "tasks-example.md", currentWorkflow: "process-task-loop" }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "topic/opaque", linkedAs: "adopted", excluded: [] }],
  });
  await h.reference.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List: example\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build**\n");
  lifecycleSuccess(await h.reference.store.write({ ...recordPut(primary, { content: writeMetaPause(primary.content, {
    pausedBy: SlugSchema.parse("test-user"), since: "2026-10-31T00:00:00Z", reason: "Waiting.",
    waitsOn: null, resumeNotes: null, open: false }) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const io = createUserIOContext(); io.exec = exec;
  const chunks: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { chunks.push(String(chunk)); return true; });
  const attest = async () => {
    chunks.length = 0;
    await attestCandidateWithReviewBoundary({ cwd, identity: "test-user", io, store: h.reference.store },
      AttestCommandInputSchema.parse({ name: "example", json: true }));
    return JSON.parse(chunks.join("")) as unknown;
  };
  const version = lifecycleSuccess(await h.reference.store.version());
  expect(await attest()).toMatchObject({ status: "rejected", reason: expect.stringContaining("arc resume example"),
    remedy: { argv: ["arc", "resume", "example"] } });
  expect(lifecycleSuccess(await h.reference.store.version())).toBe(version);
  expect((await exec("git", ["diff", "--cached", "--name-only"], { cwd })).stdout).toBe("");
  process.exitCode = 0;
  expect(await runResumePaused({ store: h.reference.store, cwd, exec, baseBranch: "main" }, { name: "example" }))
    .toMatchObject({ status: "resumed" });
  expect(await attest()).toMatchObject({ status: "attested" });
}, 30_000);
