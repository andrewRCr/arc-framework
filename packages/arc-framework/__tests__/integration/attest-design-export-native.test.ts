/** Native attestation stages the design copy before publishing its stored Candidate. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { AttestCommandInputSchema, attestCandidateWithReviewBoundary } from "../../src/handlers/lifecycle-delivery-review.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
import { AttestResultSchema } from "../../src/lib/work-unit/verbs/attest.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

async function fixture(options: { complete?: boolean; tracking?: "none" | "specs" } = {}) {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    `branch.base: main\narchive.cadence: manual\nstorage.track_design_docs: ${options.tracking ?? "specs"}\n`);
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
    `# Task List: example\n\n## **Phase 1:** Build\n\n### \`[${options.complete === false ? " " : "x"}]\` **1.1 Build**\n`);
  await h.reference.seed(recordReferences["work-item/spec"](primary.reference.owner), "# Stored specification\n");
  const io = createUserIOContext(); io.exec = exec;
  const chunks: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { chunks.push(String(chunk)); return true; });
  return { ...h, cwd, exec, primary, attest: async () => {
    chunks.length = 0;
    await attestCandidateWithReviewBoundary({ cwd, identity: "test-user", io, store: h.reference.store },
      AttestCommandInputSchema.parse({ name: "example", json: true }));
    return JSON.parse(chunks.join("")) as unknown;
  } };
}

it("stages the stored spec before the Candidate write and preserves its subject digest", async () => {
  const h = await fixture(), path = ".arc/specs/example/spec-example.md";
  const before = await collectCandidateSubjectTarget({ cwd: h.cwd, name: "example", baseBranch: "main", exec: h.exec });
  let atWrite: string | undefined;
  const batch = h.reference.store.batch.bind(h.reference.store);
  h.reference.store.batch = async input => {
    atWrite = (await h.exec("git", ["show", `:${path}`], { cwd: h.cwd })).stdout;
    return batch(input);
  };
  const result = AttestResultSchema.parse(await h.attest());
  expect(result.status).toBe("attested");
  expect(atWrite).toBe("# Stored specification");
  expect(await readFile(join(h.cwd, path), "utf8")).toBe("# Stored specification\n");
  expect((await collectCandidateSubjectTarget({ cwd: h.cwd, name: "example", baseBranch: "main", exec: h.exec }))
    .subject.subjectDigest).toBe(before.subject.subjectDigest);
}, 30_000);

it.each(["refused", "disabled"] as const)("exports no copy when attestation is %s", async mode => {
  const h = await fixture(mode === "refused" ? { complete: false } : { tracking: "none" });
  const result = await h.attest();
  expect(result).toMatchObject({ status: mode === "refused" ? "rejected" : "attested" });
  await expect(readFile(join(h.cwd, ".arc/specs/example/spec-example.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.exec("git", ["diff", "--cached", "--name-only"], { cwd: h.cwd })).stdout).toBe("");
}, 30_000);

it("stages an already matching untracked copy at attestation", async () => {
  const h = await fixture(), path = ".arc/specs/example/spec-example.md";
  await mkdir(join(h.cwd, ".arc/specs/example"), { recursive: true });
  await writeFile(join(h.cwd, path), "# Stored specification\n");
  expect(await h.attest()).toMatchObject({ status: "attested" });
  expect((await h.exec("git", ["show", `:${path}`], { cwd: h.cwd })).stdout).toBe("# Stored specification");
}, 30_000);
