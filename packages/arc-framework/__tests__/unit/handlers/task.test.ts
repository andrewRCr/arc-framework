/** Task reports retain store diagnostics and executable recovery through the real terminal boundary. */
import { afterEach, expect, it, vi, onTestFinished } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskCommandContext, renderTaskClose, renderTaskDefer } from "../../../src/handlers/task.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { StoreRefusalSchema } from "../../../src/lib/store/refusal.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });
it("refuses unbound task context with exits and resolves it after marker binding", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-task-unbound-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  const h = createLifecycleHarness(), primary = await h.seedMeta("example");
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: "example" }, spawningIdentity: "test-user", now: 0 });
  let output = "";
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const io = createUserIOContext(); io.exec = async () => { throw new Error("No Git is needed to select task context"); };
  const base = { cwd, identity: "test-user", store: h.store, io }, before = lifecycleSuccess(await h.store.version());
  expect(await createTaskCommandContext(base)).toBeNull();
  expect(output).toContain("arc materialize example --here");
  expect(output).toContain("arc locus release");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: boundWorkUnitSubject(primary), spawningIdentity: "test-user", now: 0 });
  expect(await createTaskCommandContext(base)).toMatchObject({ slug: "example", store: h.store, cwd });
});
it.each([
  { name: "close", render: renderTaskClose },
  { name: "defer", render: renderTaskDefer },
])("renders the store code and executable repair for $name", ({ render }) => {
  process.exitCode = undefined;
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const refusal = StoreRefusalSchema.parse({ code: "record-malformed", class: "recoverable",
    reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "demo" })),
    rule: "metadata", condition: "The stored record is malformed.",
    remedy: { text: "Repair the named record.", argv: ["arc", "status", "--json"] } });
  render({ status: "refused", code: refusal.code, reason: refusal.condition, remedy: refusal.remedy, refusal });
  const output = [...stdout.mock.calls, ...stderr.mock.calls].map(([chunk]) => String(chunk)).join("");
  expect(output).toContain("record-malformed: The stored record is malformed.");
  expect(output).toContain("Repair the named record.");
  expect(output).toContain("arc status --json");
  expect(process.exitCode).toBe(1);
});

it("reports ordinary captures separately from rewrite attribution", () => {
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const ordinary = "a".repeat(40), rewrite = "b".repeat(40), matched = "c".repeat(40);
  renderTaskClose({ status: "closed", ids: ["1.1"], changed: true, captured: [ordinary, rewrite],
    warnings: [], uncapturedTasks: [], attributions: [{ sha: rewrite, matched, excluded: true }] });
  const output = [...stdout.mock.calls, ...stderr.mock.calls].map(([chunk]) => String(chunk)).join("");
  expect(output).toContain(`Captured ${ordinary}`);
  expect(output).toContain(`${rewrite} matches ${matched}; attributed to the exclusions.`);
  expect(output).not.toContain(`Captured ${rewrite}`);
});
