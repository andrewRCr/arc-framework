/** CLI-generated actions mutate the selected store beside a real, CLI-initialized Git checkout. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
import { createTempRepo, cleanupTempDir, makeGitExec, addBareRemote } from "../helpers/integration.js";
import { runArc } from "../e2e/helpers.js";
import { createInboxHarness } from "../helpers/inbox-harness.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { readWorktreeMarker, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { inboxEntrySourceDigest } from "../../src/lib/user-sync/inbox-writer.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { resolveEntryList } from "../../src/lib/inbox/lists.js";
import { listInbox } from "../../src/lib/inbox/listing.js";
it("inserts a capture from a CLI-owned stdin route, then moves it by CLI-parsed ID/version", async () => {
  const cwd = await createTempRepo();
  onTestFinished(() => cleanupTempDir(cwd));
  expect((await runArc(["init", "--yes", "--name", "test-project"], cwd)).exitCode).toBe(0);
  const exec = makeGitExec(cwd);
  await exec("git", ["add", "."]);
  await exec("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "Initialized project"]);
  await exec("git", ["config", "arc.identity", "test-user"]);
  const before = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  const h = createInboxHarness();
  binding.store = h.context.store;
  const originalCwd = process.cwd();
  const originalExit = process.exitCode;
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stdin = vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* (): AsyncGenerator<string, undefined> { yield "### **CLI capture**\n\nCaptured through argv and stdin\n"; return undefined; });
  try {
    process.chdir(cwd);
    process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "route", "--to", "project"]);
    expect(await listInbox({ list: "project" }, h.context)).toMatchObject({ entries: [{ title: "CLI capture", id: expect.stringMatching(/^[a-f0-9]{8}$/u) }] });
    const inserted = JSON.parse(output) as {
      entryId: string;
    };
    output = "";
    const listed = await listInbox({ list: "project" }, h.context);
    if (listed.state === "refused" || !listed.entries[0])
      throw new Error("No routed entry");
    await dispatchRegisteredCli(["--no-input", "route", inserted.entryId, "--from", "project", "--expected-version", listed.entries[0].version, "--to", "personal", "--section", "Errand"]);
    expect(await listInbox({ list: "project" }, h.context)).toMatchObject({ entries: [] });
    expect(await listInbox({ list: "personal" }, h.context)).toMatchObject({ entries: [{ id: inserted.entryId, title: "CLI capture", section: "Errand" }] });
    expect((await exec("git", ["rev-parse", "HEAD"])).stdout).toBe(before);
  }
  finally {
    stdout.mockRestore();
    stdin.mockRestore();
    binding.store = null;
    process.chdir(originalCwd);
    process.exitCode = originalExit;
  }
}, 30000);
async function lifecycleFixture(protection: "full" | "partial") {
  const cwd = await createTempRepo();
  onTestFinished(() => cleanupTempDir(cwd));
  const initialized = await runArc(["init", "--yes", "--name", "test-project"], cwd);
  expect(initialized.exitCode).toBe(0);
  const path = join(cwd, ".arc", "system", "arc-config.yml");
  let config = await readFile(path, "utf8");
  for (const [key, value] of [["branch.protection", protection], ["branch.base", "main"], ["session.remote_sync", "disabled"]]) {
    const pattern = new RegExp(`^${key?.replaceAll(".", "\\.")}:.*$`, "mu");
    config = pattern.test(config) ? config.replace(pattern, `${key}: ${value}`) : `${config}\n${key}: ${value}\n`;
  }
  await writeFile(path, config);
  const exec = makeGitExec(cwd);
  await mkdir(join(cwd, ".git", "a17-hooks"));
  await exec("git", ["config", "core.hooksPath", join(cwd, ".git", "a17-hooks")]);
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["add", "."]);
  await exec("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "Initialized project"]);
  await exec("git", ["config", "arc.identity", "test-user"]);
  const h = createInboxHarness();
  await h.inbox("project");
  await seed(h.fixture, recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "test-project", uid: randomUUID() })), "{}");
  return { h, cwd, exec, before: (await exec("git", ["rev-parse", "HEAD"])).stdout };
}
async function invokeRegistered(h: Awaited<ReturnType<typeof lifecycleFixture>>, args: readonly string[]) {
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let stdout = "", stderr = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { stderr += String(chunk); return true; });
  try {
    binding.store = h.h.context.store;
    process.chdir(h.cwd);
    process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", ...args]);
    return { exitCode: process.exitCode, stdout, stderr, result: stdout.trim() ? JSON.parse(stdout) as Record<string, unknown> : null };
  }
  finally {
    out.mockRestore();
    err.mockRestore();
    binding.store = null;
    process.chdir(originalCwd);
    process.exitCode = originalExit;
  }
}
it("opens a full Errand from the project queue, then abandons it back through real branch and occupancy changes", async () => {
  const h = await lifecycleFixture("full"), queue = join(h.cwd, ".git", "queue.json");
  await writeFile(queue, JSON.stringify({ schemaVersion: 1, members: [{ inbox: "project", id: "12345678" }] }));
  expect(await invokeRegistered(h, ["errand", "queue", "set", queue])).toMatchObject({ result: { state: "set" } });
  const opened = await invokeRegistered(h, ["errand", "open", "cli-full", "--from-inbox", "project:12345678", "--json"]);
  expect(opened).toMatchObject({ result: { outcome: "applied", identity: { originEntry: "project:12345678", originEntrySourceDigest: null } } });
  expect((await h.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("chore/cli-full");
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "errand", slug: "cli-full" } } });
  expect(await listInbox({ list: "project" }, h.h.context)).toMatchObject({ entries: [] });
  expect(await listInbox({ list: "cli-full" }, h.h.context)).toMatchObject({ entries: [{ id: "12345678", fields: { Created: "2026-01-01" } }] });
  expect(await invokeRegistered(h, ["errand", "queue", "--json"])).toMatchObject({ result: { members: [] } });
  const abandoned = await invokeRegistered(h, ["errand", "abandon", "cli-full", "--json"]);
  expect(abandoned, JSON.stringify(abandoned.result)).toMatchObject({ result: { outcome: "applied", settlement: { disposition: "retained" } } });
  expect((await h.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("main");
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  const ref = success(await h.h.context.store.lookup({ kind: "slug", slug: SlugSchema.parse("cli-full") }));
  expect(success(await h.h.context.store.read({ reference: ref.reference }))).toMatchObject({ placement: { kind: "completed" } });
  expect(await listInbox({ list: "cli-full" }, h.h.context)).toMatchObject({ entries: [] });
  const returned = await listInbox({ list: "project" }, h.h.context);
  expect(returned).toMatchObject({ entries: [{ id: "12345678", fields: { Created: "2026-01-01" } }] });
  if (returned.state !== "refused")
    expect(returned.entries[0]?.survivor).toBeUndefined();
}, 30000);
it("opens a partial Errand with a version binding and closes only that project entry after a real push", async () => {
  const h = await lifecycleFixture("partial");
  await addBareRemote(h.cwd);
  await h.exec("git", ["push", "-u", "origin", "main"]);
  const listed = await listInbox({ list: "project" }, h.h.context);
  if (listed.state === "refused" || !listed.entries[0])
    throw new Error("No capture");
  const version = listed.entries[0].version;
  expect(await invokeRegistered(h, ["errand", "open", "cli-partial", "--from-inbox", "project:12345678", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "partial-errand", slug: "cli-partial" }, originEntry: "project:12345678", originEntryVersion: version } });
  expect(await listInbox({ list: "project" }, h.h.context)).toMatchObject({ entries: [{ id: "12345678" }] });
  const closed = await invokeRegistered(h, ["errand", "close", "cli-partial", "--json"]);
  expect(closed, JSON.stringify(closed.result)).toMatchObject({ result: { outcome: "applied", settlement: { disposition: "removed", originEntry: "project:12345678", originEntrySourceDigest: null } } });
  expect(await listInbox({ list: "project" }, h.h.context)).toMatchObject({ entries: [] });
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect((await h.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("main");
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
  expect(await invokeRegistered(h, ["errand", "close", "cli-partial", "--json"])).toMatchObject({ result: { outcome: "idempotent", settlement: { disposition: "absent" } } });
}, 30000);
it("mints a text description and links a project capture beside it from registered options", async () => {
  const h = await lifecycleFixture("full");
  expect(await invokeRegistered(h, ["errand", "open", "cli-linked", "--intent", "Free typed text", "--json"])).toMatchObject({ result: { outcome: "applied", identity: { origin: "description", originEntry: null } } });
  const initial = await listInbox({ list: "cli-linked" }, h.h.context);
  expect(initial).toMatchObject({ entries: [{ title: "cli-linked", raw: expect.stringContaining("Free typed text"), id: expect.stringMatching(/^[a-f0-9]{8}$/u) }] });
  expect(await invokeRegistered(h, ["errand", "link", "cli-linked", "--from-inbox", "project:12345678", "--json"])).toMatchObject({ result: { outcome: "applied", identity: { originEntry: "project:12345678", originEntrySourceDigest: null } } });
  expect(await listInbox({ list: "cli-linked" }, h.h.context)).toMatchObject({ entries: [{ title: "cli-linked", raw: expect.stringContaining("Free typed text") }, { id: "12345678", fields: { Created: "2026-01-01" } }] });
  expect(await listInbox({ list: "project" }, h.h.context)).toMatchObject({ entries: [] });
  expect((await h.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("chore/cli-linked");
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "errand", slug: "cli-linked" } } });
}, 30000);
it.each([false, true])("closes a partial Errand with a pre-import digest marker after ID stamping (edited=%s)", async edited => {
  const h = await lifecycleFixture("partial");
  await addBareRemote(h.cwd); await h.exec("git", ["push", "-u", "origin", "main"]);
  const beforeImport = "## Errand\n\n### **Concern**\n- _Created:_ `2026-01-01`\n\nOriginal capture\n";
  const digest = inboxEntrySourceDigest(beforeImport, "Concern");
  const imported = await seed(h.h.fixture, h.h.fixture.reference("personal/inbox"), beforeImport);
  const listed = await listInbox({ list: "personal" }, h.h.context);
  if (listed.state === "refused" || !listed.entries[0]) throw new Error("Imported capture required");
  expect(await invokeRegistered(h, ["errand", "open", "legacy-partial", "--from-inbox", `personal:${listed.entries[0].id}`, "--json"]))
    .toMatchObject({ result: { outcome: "applied" } });
  const read = await readWorktreeMarker(h.cwd);
  if (read.kind !== "present") throw new Error("Partial marker required");
  const marker = { ...read.marker, originEntry: "Concern", originEntrySourceDigest: digest };
  delete marker.originEntryVersion;
  await writeWorktreeMarker(h.cwd, marker);
  if (edited) success(await h.h.context.store.write({ action: "put", reference: imported.reference, expected: imported.version,
    content: imported.content.replace("Original capture", "Edited capture"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const closed = await invokeRegistered(h, ["errand", "close", "legacy-partial", "--json"]);
  expect(closed, JSON.stringify(closed)).toMatchObject({ result: { outcome: "applied", settlement: { disposition: edited ? "retained" : "removed" } } });
  expect(await listInbox({ list: "personal" }, h.h.context)).toMatchObject({ entries: edited ? [{ raw: expect.stringContaining("Edited capture") }] : [] });
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
}, 30000);
it("closes an unchanged full Errand without removing a later inbox entry of the same ID", async () => {
  const h = await lifecycleFixture("full");
  await addBareRemote(h.cwd);
  expect(await invokeRegistered(h, ["errand", "open", "cli-close", "--from-inbox", "project:12345678", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  const { entry } = await import("../helpers/inbox-harness.js");
  const source = await resolveEntryList("project", h.h.context);
  if (source.status !== "ok" || source.result.saved === null) throw new Error("Project inbox record missing");
  success(await h.h.context.store.write({ action: "put", reference: source.result.reference, expected: source.result.saved.version,
    content: `## Inbox\n\n${entry("12345678", "Later capture", "Leave this new capture")}\n`, provenance: { verb: "fixture-edit", lifecycleAction: "edit" } }));
  const closed = await invokeRegistered(h, ["errand", "close", "cli-close", "--json"]);
  expect(closed, JSON.stringify(closed.result)).toMatchObject({ result: { outcome: "applied", settlement: { disposition: "absent" }, leftOut: [], skipped: [] } });
  expect(await listInbox({ list: "project" }, h.h.context)).toMatchObject({ entries: [{ id: "12345678", title: "Later capture" }] });
  expect(await listInbox({ list: "cli-close" }, h.h.context)).toMatchObject({ entries: [{ id: "12345678", title: "Concern" }] });
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
  expect((await h.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("main");
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(h.before);
  const ref = success(await h.h.context.store.lookup({ kind: "slug", slug: SlugSchema.parse("cli-close") }));
  expect(success(await h.h.context.store.read({ reference: ref.reference }))).toMatchObject({ placement: { kind: "completed" } });
}, 30000);

it.each(["full", "partial"] as const)("preserves the queue remedy and resumable evidence during %s close refusal, then retries", async protection => {
  const h = await lifecycleFixture(protection), slug = "queue-refusal";
  await addBareRemote(h.cwd);
  await h.exec("git", ["push", "-u", "origin", "main"]);
  expect(await invokeRegistered(h, ["errand", "open", slug, "--from-inbox", "project:12345678", "--json"]))
    .toMatchObject({ result: { outcome: "applied" } });
  const branch = (await h.exec("git", ["branch", "--show-current"])).stdout;
  const beforeRefusal = await h.h.context.store.version();
  const read = h.h.context.store.read.bind(h.h.context.store);
  let broken = true;
  h.h.context.store.read = input => broken && input.reference.kind === "personal/errand-queue"
    ? Promise.resolve({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "personal",
      condition: "Execution queue is unavailable.", remedy: { text: "Restore the queue namespace and retry close." } } }) : read(input);
  const refused = await invokeRegistered(h, ["errand", "close", slug, "--json"]);
  expect(JSON.stringify(refused.result)).toContain("Execution queue is unavailable.");
  expect(JSON.stringify(refused.result)).toContain("Restore the queue namespace and retry close.");
  expect(await readWorktreeMarker(h.cwd)).toMatchObject({ kind: "present" });
  expect((await h.exec("git", ["branch", "--show-current"])).stdout).toBe(branch);
  if (protection === "full") {
    expect(await h.h.context.store.version()).toEqual(beforeRefusal);
    const selected = success(await h.h.context.store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) }));
    expect(success(await read({ reference: selected.reference }))).toMatchObject({ fields: { state: "open" } });
  }
  broken = false;
  const retried = await invokeRegistered(h, ["errand", "close", slug, "--json"]);
  expect(retried, JSON.stringify(retried.result)).toMatchObject({ result: { outcome: "applied" } });
  expect(await readWorktreeMarker(h.cwd)).toEqual({ kind: "absent" });
}, 30000);
