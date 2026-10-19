/** Recovery keeps its projected cursor and reconstructed anchor in one operational snapshot. */
import { expect, it, vi } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Store } from "../../src/lib/store/contract.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
import { makeUnclosedTaskFixture } from "../helpers/unclosed-task-commits.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { CompactionSeedSchema } from "../../src/lib/compaction-seed/schema.js";
import { RecoverAuditReportSchema } from "../../src/lib/recover/report.js";
import { resolveTaskListCursor } from "../../src/lib/task-list/cursor.js";
import { handleRecoverStatus } from "../../src/handlers/status/session.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { createSessionStatusContext } from "../../src/handlers/status/session-context.js";
import { createRecoverStatusProbes } from "../../src/handlers/recover-probes.js";
import { HistoryRefSchema } from "../../src/lib/store/refusal.js";
import { createStoreSyncPort } from "../../src/lib/store/operational-sync.js";
import { createExecaGitExecInput } from "../../src/lib/git/process-executor.js";

const before = "# Tasks\n\n### `[ ]` **1.1 Earlier**\n\n### `[ ]` **1.2 Later**\n";
async function fixture() {
  const h = await makeUnclosedTaskFixture({ tasks: before }), project = randomUUID();
  await h.git(["config", "arc.identity", "test-user"]);
  await h.git(["config", "arc.role", "maintainer"]);
  await mkdir(join(h.cwd, ".arc/system"), { recursive: true });
  await writeFile(join(h.cwd, ".arc/system/arc-config.yml"), "branch.base: main\nsession.remote_sync: disabled\n");
  await h.git(["add", ".arc/system/arc-config.yml"]); await h.git(["commit", "-m", "Recovery configuration"]);
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "snapshot-project", uid: project })), "{}");
  await h.putLinks({ branches: [{ repository: project, ref: "feat/demo", linkedAs: "created", excluded: [] }] });
  await ensureWorktreeMarkerIgnored(h.cwd, h.input.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-18T00:00:00Z",
    createdFor: { kind: "work-unit", name: "demo" } });
  return h;
}

it("retains the cursor's earlier state when tasks advance during the registered audit", async () => {
  const h = await fixture(), after = before.replace("[ ]", "[x]");
  const seedPath = join(h.cwd, ".arc/user/test-user/.internal/compaction-seed.json");
  await mkdir(join(h.cwd, ".arc/user/test-user/.internal"), { recursive: true });
  await writeFile(seedPath, JSON.stringify(CompactionSeedSchema.parse({ schemaVersion: 2, emittedAt: "2026-10-18T00:00:00Z",
    repoRoot: h.cwd, branch: "feat/demo", head: await h.git(["rev-parse", "HEAD"]), stateVersion: null, dirty: false,
    activeWorkUnit: "demo", metaPath: ".arc/active/meta-demo.md", sessionType: "execution", currentWorkflow: "process-task-loop",
    taskCursor: null, loadSet: { manifestVersion: 1, entries: [] }, uncommittedFiles: [],
    locus: { checkoutPath: h.cwd, parentCheckoutPath: null } })));
  const captured = lifecycleSuccess(await h.store.version());
  const read = h.store.read.bind(h.store);
  let advanced = false;
  h.store.read = async input => {
    const result = await read(input);
    if (!advanced && input.reference.kind === "work-item/task-list" && result.status === "ok") {
      advanced = true;
      lifecycleSuccess(await h.store.write({ action: "put", reference: h.tasks.reference, expected: h.tasks.version, content: after,
        provenance: { verb: "task-close", lifecycleAction: "update" } }));
    }
    return result;
  };
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store; process.chdir(h.cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "recover", "audit", "--seed-path", seedPath, "--json"]);
    const report = RecoverAuditReportSchema.parse(JSON.parse(output));
    expect(advanced).toBe(true);
    expect(report.recover?.taskCursor).toEqual({ ok: true, value: resolveTaskListCursor(before) });
    expect(report.stateBasis).toEqual({ rebuilt: true, stateVersion: captured });
    expect(lifecycleSuccess(await read({ reference: h.tasks.reference, asOf: captured })).content).toBe(before);
    expect(lifecycleSuccess(await read({ reference: h.tasks.reference })).content).toBe(after);
    expect(lifecycleSuccess(await h.store.version())).not.toBe(captured);
    expect(JSON.parse(await readFile(seedPath, "utf8")).stateVersion).toBeNull();
  } finally { stdout.mockRestore(); binding.store = null; process.chdir(originalCwd); process.exitCode = originalExit; }
}, 30_000);


it.each([true, false])("preserves strict snapshot acquisition and named-history repair, repaired=%s", async repaired => {
  const h = await fixture(), version = h.store.version.bind(h.store);
  let available = false;
  const pulled: (readonly string[])[] = [];
  const refs = [HistoryRefSchema.parse(`refs/arc/history/work/${randomUUID()}`)];
  h.store.version = async () => available ? version() : { status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: refs,
    condition: "Snapshot refs are unavailable.", remedy: { text: "Restore snapshot refs and retry." },
  } };
  const sync = createStoreSyncPort({ pull: async refs => { pulled.push(refs ?? []); available = repaired; return { status: "pulled" }; } });
  const makeProbes = () => createRecoverStatusProbes({ cwd: h.cwd, exec: (command, args, options) => h.input.exec(command, args, { ...options, cwd: options?.cwd ?? h.cwd }), execInput: createExecaGitExecInput(),
    readFile: path => readFile(path, "utf8"), dirty: async () => ({ state: "clean", fileCount: 0 }), store: h.store, sync });
  const probes = makeProbes();
  if (!repaired) {
    await expect(probes.derivedLocusState!("test-user")).rejects.toThrow("Snapshot refs are unavailable. Restore snapshot refs and retry.");
    await expect(probes.stateVersion("test-user")).rejects.toThrow("Snapshot refs are unavailable. Restore snapshot refs and retry.");
    available = true;
  }
  const retry = repaired ? probes : makeProbes();
  const frame = await retry.derivedLocusState!("test-user");
  expect(frame.entering).toMatchObject({ kind: "selected", row: { context: { taskCursor: resolveTaskListCursor(before) } } });
  expect(await retry.stateVersion("test-user")).toBe(lifecycleSuccess(await version()));
  expect(pulled).toEqual([refs]);
}, 30_000);


it.each([true, false])("uses the selected history port through recovery status, repaired=%s", async repaired => {
  const h = await fixture(), version = h.store.version.bind(h.store);
  const refs = [HistoryRefSchema.parse(`refs/arc/history/work/${randomUUID()}`)];
  let available = false;
  const pulls: (readonly string[])[] = [];
  h.store.version = async () => available ? version() : { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", historyRefs: refs,
    condition: "Status snapshot is unavailable.", remedy: { text: "Restore the named history refs." } } };
  const sync = createStoreSyncPort({ pull: async selected => { pulls.push(selected ?? []); available = repaired; return { status: "pulled" }; } });
  const exec: typeof h.input.exec = (command, args, options) => h.input.exec(command, args, { ...options, cwd: options?.cwd ?? h.cwd });
  const context = await createSessionStatusContext(h.cwd, exec, createRawGitExec(h.cwd), createRawGitExec(h.cwd), undefined, { store: h.store, sync });
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    await handleRecoverStatus(context, { json: true });
    expect(pulls).toEqual([refs]);
    if (repaired) expect(JSON.parse(output).derivedLocusState).toMatchObject({ ok: true });
    else expect(output).toContain("Status snapshot is unavailable");
  } finally { stdout.mockRestore(); }
}, 30_000);
