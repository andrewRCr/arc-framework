/** Project status renders the selected operational store without creating a derived file. */
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import { createSessionStatusContext } from "../../../../src/handlers/status/session-context.js";
import { handleProjectStatus } from "../../../../src/handlers/status/views.js";
import { StatusCommandInputSchema, type StatusCliOptions } from "../../../../src/handlers/status/input.js";
import { MetaPauseSchema } from "../../../../src/lib/active/meta-schema.js";
import { writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec, scriptRawGitExec } from "../../../helpers/git-exec-fake.js";
import { runHandlerAt } from "../../../helpers/handler.js";

const folders: string[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture(store: Store, reviewAfterDays = 14) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-project-store-")); folders.push(cwd);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await mkdir(join(cwd, ".arc/backlog"));
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), `pause.review_after_days: ${reviewAfterDays}\n`);
  await writeFile(join(cwd, "ROADMAP.md"), "preserved view\n");
  const { exec } = scriptGitExec([
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ stdout: "andrew\0" }] },
    { match: ["config", "--get", "arc.role"], responses: [{ stdout: "maintainer" }] },
    { match: { prefix: ["config"] }, responses: [{ failure: { exitCode: 1 } }] },
    { match: { predicate: () => true }, responses: [{ failure: { exitCode: 128, stderr: "fatal: not a git repository" } }] },
  ]);
  const { exec: raw } = scriptRawGitExec([
    { match: { predicate: () => true }, responses: [{ failure: { exitCode: 128, stderr: "fatal: not a git repository" } }] },
  ]);
  const context = await createSessionStatusContext(cwd, exec, raw, raw, undefined, { store });
  return { cwd, run: (opts: StatusCliOptions = {}) => runHandlerAt(cwd,
    () => handleProjectStatus(context, StatusCommandInputSchema.parse({ project: true, fetch: false, ...opts }))) };
}

it("renders placement tiers and configured pause marks without writing a file", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  const h = createLifecycleHarness();
  await h.seedMeta("active");
  await h.seedMeta("ready", { state: "Planning", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
  await h.seedMeta("blocked", { state: "Planning", currentWorkflow: "draft-design", dependsOn: ["active"] }, { kind: "backlog", commitment: "planned" });
  const paused = await h.seedMeta("paused");
  lifecycleSuccess(await h.store.write({ ...recordPut(paused, { content: writeMetaPause(paused.content,
    MetaPauseSchema.parse({ pausedBy: "andrew", since: "2026-10-01T12:00:00.000Z", reason: "Waiting" })) }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const f = await fixture(h.store, 30);
  const before = await readdir(f.cwd, { recursive: true });
  const version = lifecycleSuccess(await h.store.version());
  const output = await f.run({ json: true });
  expect(output.exitCode).toBe(0);
  expect(output.stderr).toBe("");
  const result = JSON.parse(output.stdout);
  expect(result.markdown).toMatch(/## In Flight[\s\S]*active[\s\S]*## Ready[\s\S]*ready[\s\S]*## Blocked[\s\S]*blocked[\s\S]*## Paused[\s\S]*paused/u);
  expect(result.markdown).not.toContain("review-due");
  expect(result.markdown).not.toContain("Rendered ref");
  expect(result.warnings).toEqual([]);
  const text = await f.run();
  expect(text).toEqual({ stdout: `${result.markdown}\n`, stderr: "", exitCode: 0 });
  expect(await readFile(join(f.cwd, "ROADMAP.md"), "utf8")).toBe("preserved view\n");
  expect(await readdir(f.cwd, { recursive: true })).toEqual(before);
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});

it.each([false, true])("refuses an unreadable lifecycle listing with its repair route (json=%s)", async json => {
  const h = createLifecycleHarness();
  const store = Object.create(h.store) as Store;
  store.list = async input => input.kind === "work-item/meta"
    ? { status: "ok", result: { status: "unreadable", condition: "Lifecycle index unavailable.", remedy: { text: "Restore the lifecycle index and retry." } } }
    : h.store.list(input);
  const f = await fixture(store);
  const refused = await f.run({ json });
  expect(refused).toEqual({ exitCode: 1,
    stderr: "Error [listing-unreadable]: Lifecycle index unavailable. Restore the lifecycle index and retry.\n",
    stdout: json ? `${JSON.stringify({ status: "refused", refusal: { code: "listing-unreadable",
      condition: "Lifecycle index unavailable.", remedy: { text: "Restore the lifecycle index and retry." } } })}\n` : "" });
  store.list = input => h.store.list(input);
  const repaired = await f.run({ json });
  expect(repaired.exitCode).toBe(0);
  expect(repaired.stderr).toBe("");
  expect(repaired.stdout).toContain("No ready work units");
});

it.each([false, true])("refuses staged project status from an off-branch store (write=%s)", async write => {
  const h = createLifecycleHarness();
  const f = await fixture(h.store);
  const before = await readdir(f.cwd, { recursive: true });
  const result = await f.run({ staged: true, write });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(/^Error \[unsupported\]: .*arc status --project/u);
  expect(await readFile(join(f.cwd, "ROADMAP.md"), "utf8")).toBe("preserved view\n");
  expect(await readdir(f.cwd, { recursive: true })).toEqual(before);
});
