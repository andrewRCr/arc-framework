/** Resume clears the operational record through the direct handler arm without remote expansion. */
import { afterEach, expect, it, vi } from "vitest";
import { publishCandidateWithReviewBoundary } from "../../../src/handlers/lifecycle-delivery-review.js";
import { handleStoreResume } from "../../../src/handlers/lifecycle-collaboration.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { reportOutcome } from "../../../src/handlers/lifecycle-shared.js";
it("resumes through the store handler with no Git or tracked metadata reads", async () => {
  const h = createLifecycleHarness(), original = await h.seedMeta("example");
  lifecycleSuccess(await h.store.write({ action: "put", reference: original.reference, expected: original.version, placement: { kind: "active" },
    content: writeMetaPause(original.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const git = scriptGitExec([]), io = createUserIOContext(); io.exec = git.exec;
  io.readFile = async () => { throw new Error("No tracked meta exists"); };
  const base = { cwd: "/checkout", identity: "test-user", io, store: h.store };
  const executor = buildExecutorContext({ ...base, teamMode: false, baseBranch: "main", internalTemplateDir: "/templates" });
  await handleStoreResume(base, executor, "main", "example");
  expect(lifecycleSuccess(await h.store.read({ reference: original.reference })).content).toBe(original.content);
  expect(git.calls).toEqual([]);
});

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });
it("reports the persisted records and executable physical continuation with a nonzero exit", () => {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  reportOutcome("Reopened", ["Work unit: example"], { status: "ok", verb: "reopen",
    from: { phase: "Integrating", location: "active" }, to: { phase: "Active", location: "active" },
    legsFired: [], sideEffectsFired: [], advisories: [], softFieldsWritten: [], branchFieldWritten: null, suggestion: null,
    continuation: { kind: "git-step", step: "withdraw-pr", reason: "Host unavailable.", argv: ["gh", "pr", "close", "feat/example"] } });
  expect(process.exitCode).toBe(1);
  expect(output.join("")).toContain("gh pr close feat/example");
  expect(output.join("")).toContain("withdraw-pr");
});
it("publication's store handler names resume before reading missing Candidate evidence", async () => {
  const h = createLifecycleHarness(), primary = await h.seedMeta("example");
  lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version, placement: { kind: "active" },
    content: writeMetaPause(primary.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const paused = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  const git = scriptGitExec([]), io = createUserIOContext(); io.exec = git.exec;
  const output: string[] = []; vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  await publishCandidateWithReviewBoundary({ cwd: "/checkout", identity: "test-user", io, store: h.store }, "example", { json: true });
  expect(JSON.parse(output.join(""))).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "resume", "example"] } });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(paused);
  expect(git.calls).toEqual([]);
});
