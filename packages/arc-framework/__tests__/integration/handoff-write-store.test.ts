/** Handoff writes use real checkout claims and one reference-backend mutation. */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { createGitExec } from "../../src/lib/io-context.js";
import { runHandoffWrite } from "../../src/lib/handoff/write.js";
import { HandoffWriteRequestSchema } from "../../src/lib/handoff/write-schema.js";
import { createStoreSyncPort } from "../../src/lib/store/operational-sync.js";
import { ParsedMetaRecordSchema } from "../../src/lib/active/meta-schema.js";
import { writeMetaNextAction } from "../../src/lib/store/kinds/meta/writers.js";
import { createMemoryRemote } from "../helpers/store/sync.js";
import { ReferenceBackend } from "../helpers/store/reference-backend.js";
import { handleHandoffWrite } from "../../src/handlers/handoff-write.js";
import { HandoffWriteResultSchema } from "../../src/lib/handoff/write-schema.js";
import type { StoreSyncPort } from "../../src/lib/store/operational-sync.js";
import type { Store } from "../../src/lib/store/contract.js";
const selected = vi.hoisted(() => ({ store: undefined as Store | undefined }));
vi.mock("../../src/lib/store/create.js", () => ({ createStore: () => {
  if (selected.store === undefined) throw new Error("No store selected for this CLI invocation");
  return selected.store;
} }));

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(mark = true) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-handoff-write-")); roots.push(cwd);
  const git = createGitExec();
  const exec: typeof git = (command, args, options) => git(command, args, { ...options, cwd });
  await exec("git", ["init", "--initial-branch=main"]);
  await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "Initial"]);
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("subject");
  if (mark) await writeWorktreeMarker(cwd, { createdFor: { kind: "work-unit", name: "subject" }, spawningIdentity: "test-user", spawnedByArc: false, createdAt: "2026-10-16T00:00:00Z" });
  return { ...h, cwd, exec, meta };
}
const request = { schemaVersion: 1 as const, sessionContext: "Whole context.\n\n##inside is prose", nextAction: "Continue the task", sessionType: "execution" as const };
it("admits optional session type while refusing both computed anchors as unknown fields", () => {
  expect(HandoffWriteRequestSchema.parse(request)).toEqual(request);
  expect(HandoffWriteRequestSchema.parse({ schemaVersion: 1, sessionContext: "", nextAction: "Continue" }).sessionType).toBeUndefined();
  for (const key of ["stateAtHandoff", "commitAtHandoff"]) expect(HandoffWriteRequestSchema.safeParse({ ...request, [key]: "forged" }).success).toBe(false);
});
it("lands five fields in one write at the observed state and real HEAD", async () => {
  const h = await fixture();
  const before = lifecycleSuccess(await h.store.version());
  const result = await runHandoffWrite({ ...h, request });
  expect(result).toMatchObject({ status: "written" });
  const meta = lifecycleSuccess(await h.store.read({ reference: h.meta.reference }));
  expect(ParsedMetaRecordSchema.parse(meta.fields)).toMatchObject({ stateAtHandoff: before,
    commitAtHandoff: (await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim(), sessionType: "execution",
    nextAction: request.nextAction, sessionContext: request.sessionContext });
  expect(lifecycleSuccess(await h.store.history({ reference: h.meta.reference }))).toHaveLength(2);
});
it("writes an omitted Session Type as none", async () => {
  const h = await fixture();
  await runHandoffWrite({ ...h, request });
  const withoutType = { schemaVersion: request.schemaVersion, sessionContext: request.sessionContext, nextAction: request.nextAction };
  expect((await runHandoffWrite({ ...h, request: withoutType })).status).toBe("written");
  expect(ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).fields).sessionType).toBeNull();
});
it.each(["## Ends the section", "  ---  "])("refuses the boundary line %s without writing, then accepts repaired prose", async (line) => {
  const h = await fixture();
  const before = lifecycleSuccess(await h.store.version());
  const sync = createStoreSyncPort({ maintain: () => { throw new Error("Refused handoff must not maintain"); } });
  const result = await runHandoffWrite({ ...h, request: { ...request, sessionContext: `Safe\n${line}` }, sync });
  expect(result).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining(line) } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect((await runHandoffWrite({ ...h, request })).status).toBe("written");
});
it("preserves a refusing version's repair, then succeeds once that read is repaired", async () => {
  const h = await fixture();
  const store: Store = Object.create(h.store) as Store;
  store.version = () => Promise.resolve({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "project",
    condition: "The project state is unreadable.", remedy: { text: "Restore the project state." } } });
  const result = await runHandoffWrite({ ...h, store, request });
  expect(result).toMatchObject({ status: "refused", refusal: { condition: "The project state is unreadable.", remedy: { text: "Restore the project state." } } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).content).toBe(h.meta.content);
  expect((await runHandoffWrite({ ...h, request })).status).toBe("written");
});
it("names the work-unit checkout when no current work unit is held, then succeeds there", async () => {
  const h = await fixture(false);
  expect(await runHandoffWrite({ ...h, request })).toMatchObject({ status: "refused", refusal: { remedy: { text: expect.stringContaining("work unit's checkout") } } });
  await writeWorktreeMarker(h.cwd, { createdFor: { kind: "work-unit", name: "subject" }, spawningIdentity: "test-user", spawnedByArc: false, createdAt: "2026-10-16T00:00:00Z" });
  expect((await runHandoffWrite({ ...h, request })).status).toBe("written");
});
it("maintains once after the landed write and reports only excessive measurements", async () => {
  const h = await fixture();
  let maintained = false;
  const sync = createStoreSyncPort({ maintain: async () => {
    if (maintained) throw new Error("Duplicate maintenance"); maintained = true;
    expect(ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).fields).stateAtHandoff).not.toBeNull();
    return { measurements: [{ ref: "refs/arc/project/inbox", commits: 2001, diskBytes: 51_000_000 }] };
  } });
  expect(await runHandoffWrite({ ...h, request, sync })).toMatchObject({ status: "written", maintenance: { growth: [{ commits: 2001, diskBytes: 51_000_000 }] } });
  expect(maintained).toBe(true);
});
it("reports maintenance failure after landing as success with a diagnostic", async () => {
  const h = await fixture();
  const sync = createStoreSyncPort({ maintain: () => Promise.reject(new Error("local maintenance failed")) });
  expect(await runHandoffWrite({ ...h, request, sync })).toMatchObject({ status: "written", diagnostics: [expect.stringContaining("local maintenance failed")] });
  expect(ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).fields).nextAction).toBe(request.nextAction);
});
it("refuses an unavailable HEAD without another write or maintenance and retries after repair", async () => {
  const h = await fixture();
  let maintained = 0;
  const sync = createStoreSyncPort({ maintain: async () => { maintained++; return { measurements: [] }; } });
  expect(await invokeHandoff(h, sync)).toMatchObject({ status: "written" });
  expect(maintained).toBe(1);
  const before = lifecycleSuccess(await h.store.version());
  await h.exec("git", ["symbolic-ref", "HEAD", "refs/heads/missing"]);
  expect(await invokeHandoff(h, sync)).toMatchObject({ status: "refused", refusal: { code: "git-head-unresolved",
    remedy: { text: expect.stringContaining("Repair HEAD") } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(maintained).toBe(1);
  await h.exec("git", ["symbolic-ref", "HEAD", "refs/heads/main"]);
  expect(await invokeHandoff(h, sync)).toMatchObject({ status: "written" });
  expect(maintained).toBe(2);
  expect(lifecycleSuccess(await h.store.version())).not.toBe(before);
});
it("refuses a synchronized meta conflict without another write or maintenance and retries after resolution", async () => {
  const h = await fixture();
  let maintained = 0;
  const sync = createStoreSyncPort({ maintain: async () => { maintained++; return { measurements: [] }; } });
  expect(await invokeHandoff(h, sync)).toMatchObject({ status: "written" });
  expect(maintained).toBe(1);
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.push());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const local = lifecycleSuccess(await h.store.read({ reference: h.meta.reference }));
  const other = lifecycleSuccess(await writer.read({ reference: h.meta.reference }));
  const provenance = { verb: "update", lifecycleAction: "update" };
  for (const [store, record, action] of [[h.store, local, "Local continuation"], [writer, other, "Remote continuation"]] as const) {
    lifecycleSuccess(await store.write({ action: "put", reference: record.reference, expected: record.version,
      content: writeMetaNextAction(record.content, action), placement: { kind: "active" }, provenance }));
  }
  lifecycleSuccess(await h.store.push());
  const disputed = lifecycleSuccess(await h.store.read({ reference: h.meta.reference }));
  expect(disputed.conflicts).toHaveLength(1);
  const before = lifecycleSuccess(await h.store.version());
  expect(await invokeHandoff(h, sync)).toMatchObject({ status: "refused", refusal: { code: "work-unit-unreadable",
    remedy: { text: expect.stringContaining("Resolve its meta conflicts") } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: disputed.reference }))).toEqual(disputed);
  expect(maintained).toBe(1);
  lifecycleSuccess(await h.store.write({ action: "put", reference: disputed.reference, expected: disputed.version,
    resolves: disputed.conflicts, content: disputed.content, placement: { kind: "active" }, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await invokeHandoff(h, sync)).toMatchObject({ status: "written" });
  expect(maintained).toBe(2);
  const repaired = lifecycleSuccess(await h.store.read({ reference: disputed.reference }));
  expect(repaired.conflicts).toEqual([]);
  expect(ParsedMetaRecordSchema.parse(repaired.fields).nextAction).toBe(request.nextAction);
});
async function invokeHandoff(h: Awaited<ReturnType<typeof fixture>>, sync: StoreSyncPort) {
  const file = join(h.cwd, "handoff-request.json");
  await writeFile(file, JSON.stringify(request));
  const cwd = process.cwd(), exitCode = process.exitCode;
  let output = "";
  const capture = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  process.chdir(h.cwd);
  try {
    await handleHandoffWrite(file, undefined, { store: h.store, sync });
    return HandoffWriteResultSchema.parse(JSON.parse(output));
  } finally { process.chdir(cwd); process.exitCode = exitCode; capture.mockRestore(); }
}
it("serves the request schema through the registered CLI", async () => {
  let output = "";
  const capture = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  const exitCode = process.exitCode;
  try {
    await dispatchRegisteredCli(["schema", "get", "handoff-write-request"]);
    const served = JSON.parse(output) as { status: string; schema: { properties: Record<string, unknown> } };
    expect(served.status).toBe("ok");
    expect(served.schema.properties).toHaveProperty("sessionContext");
    expect(served.schema.properties).not.toHaveProperty("stateAtHandoff");
  } finally { capture.mockRestore(); process.exitCode = exitCode; }
});
it("dispatches a real file request through the registered handoff action into the selected store", async () => {
  const h = await fixture();
  const file = join(h.cwd, "request.json");
  await writeFile(file, JSON.stringify(request));
  const cwd = process.cwd(); const exitCode = process.exitCode;
  let output = "";
  const capture = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  selected.store = h.store;
  process.chdir(h.cwd);
  try {
    await dispatchRegisteredCli(["handoff", "write", file]);
    expect(JSON.parse(output)).toMatchObject({ status: "written", maintenance: { growth: [], contention: null } });
    expect(ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).fields).nextAction).toBe(request.nextAction);
  } finally { process.chdir(cwd); process.exitCode = exitCode; capture.mockRestore(); selected.store = undefined; }
});
it("takes the versioned request from explicit standard input through the registered action", async () => {
  const h = await fixture();
  const cwd = process.cwd(); const exitCode = process.exitCode;
  const capture = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const stdin = vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* () { yield Buffer.from(JSON.stringify(request)); return undefined; });
  selected.store = h.store; process.chdir(h.cwd);
  try {
    await dispatchRegisteredCli(["handoff", "write", "-"]);
    expect(ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).fields).sessionContext).toBe(request.sessionContext);
  } finally { process.chdir(cwd); process.exitCode = exitCode; capture.mockRestore(); stdin.mockRestore(); selected.store = undefined; }
});
it.each(["/absent/request.json", "-"])("refuses before the flip without reading %s or mutating state", async (file) => {
  const h = await fixture();
  const store: Store = Object.create(h.store) as Store;
  Object.defineProperty(store, "capabilities", { value: { stateOffBranch: false } });
  const before = lifecycleSuccess(await h.store.version());
  const cwd = process.cwd(); const exitCode = process.exitCode;
  let output = "";
  const capture = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  selected.store = store; process.chdir(h.cwd);
  try {
    await dispatchRegisteredCli(["handoff", "write", file]);
    const result = HandoffWriteResultSchema.parse(JSON.parse(output));
    expect(result).toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "terminal", remedy: { text: expect.stringContaining("SESSION-NOTES") } } });
    expect(process.exitCode).toBe(1);
    expect(lifecycleSuccess(await h.store.version())).toBe(before);
  } finally { process.chdir(cwd); process.exitCode = exitCode; capture.mockRestore(); selected.store = undefined; }
});
