/** Full native inbox contention on linked worktrees and independently publishing clones. */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { createDefaultRefStorePorts, createRefStore, parseEntryList, writeEntryList,
  RecordReferenceSchema, type PushResult } from "../../src/lib/store/index.js";
import type { RefProcessReport } from "../fixtures/store/ref-process-protocol.js";
import { startRefWriter } from "../helpers/store/ref-process.js";
import { refSyncFixture, createRefSyncCheckout } from "../helpers/store/ref-sync.js";
import { removeGitBackedDir } from "../helpers/temp-repo.js";
import { success } from "../helpers/store/suite-tools.js";

const WRITERS = 20;
const BURST_TIMEOUT_MS = 900_000;
const inbox = RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "andrew" } });
const provenance = { verb: "user", lifecycleAction: "save" };
const personalRef = "refs/arc/user/andrew/personal";
const oldId = (writer: number) => (writer + 1).toString(16).padStart(8, "0");
const newId = (writer: number) => (writer + 101).toString(16).padStart(8, "0");
const entry = (title: string, id: string, body: string) => `### **${title}**\n\n- _Id:_ \`${id}\`\n\n${body}\n\n`;
const original = "# User Inbox\n\n## Errand\n\n" + entry("Sentinel", "fffffffe", "Retained surrounding capture.")
  + Array.from({ length: WRITERS }, (_, writer) => entry(`Old ${writer}`, oldId(writer), `Remove capture ${writer}.`)).join("")
  + "## Work Unit\n";
const nativeStore = (root: string) => createRefStore(createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null }));
function parsed(content: string) {
  const result = parseEntryList(content, "personal/inbox");
  if (!result.success) throw new Error(result.error);
  return result.data;
}
function incoming(content: string, writer: number): string {
  const document = parsed(content);
  const retained = writeEntryList({ ...document, parts: document.parts.filter((part) => part.kind !== "entry" || part.id !== oldId(writer)) });
  return retained.replace("## Work Unit", entry(`Incoming ${writer}`, newId(writer), `Accepted writer ${writer}.`) + "## Work Unit");
}
function assertInbox(record: { content: string; conflicts: readonly unknown[] }): void {
  expect(record.conflicts).toEqual([]);
  const entries = parsed(record.content).entries;
  expect(entries.map(({ id }) => id).sort()).toEqual(["fffffffe", ...Array.from({ length: WRITERS }, (_, writer) => newId(writer))].sort());
  expect(entries.find(({ id }) => id === "fffffffe")?.bytes).toContain("Retained surrounding capture.");
  for (let writer = 0; writer < WRITERS; writer += 1) {
    expect(entries.find(({ id }) => id === newId(writer))?.bytes).toContain(`Accepted writer ${writer}.`);
  }
}
function assertPublished(result: PushResult): void {
  expect(result.states).toEqual([]);
  expect(result.pulls.length).toBeGreaterThan(0);
  expect(result.pulls.every(({ status, notices }) => status !== "failed" && notices.length === 0), JSON.stringify(result, null, 2)).toBe(true);
  expect(result.publishes.length).toBeGreaterThan(0);
  expect(result.publishes.every(({ status }) => ["pushed", "reconciled", "noop"].includes(status)), JSON.stringify(result, null, 2)).toBe(true);
}
function assertWritten(report: RefProcessReport): void {
  expect(report.outcomes).toHaveLength(1);
  expect(report.outcomes[0]).toMatchObject({ status: "ok", result: { conflicts: [] } });
  expect(report.refusals.every(({ code }) => code === "lock-held")).toBe(true);
}

describe.skipIf(process.env.ARC_STORE_BURSTS !== "1").each(["default", "separate"] as const)("full inbox bursts (%s)", (layout) => {
  it("preserves twenty simultaneous worktree insertions and observed removals", async () => {
    const f = await refSyncFixture(layout), store = nativeStore(f.cloneA);
    const parent = await mkdtemp(join(tmpdir(), "arc-inbox-worktrees-"));
    onTestFinished(() => removeGitBackedDir(parent));
    const roots = [f.cloneA];
    for (let writer = 1; writer < WRITERS; writer += 1) {
      const root = join(parent, `writer-${writer}`);
      await f.a.exec("git", ["worktree", "add", "--detach", root, "HEAD"]);
      roots.push(root);
    }
    success(await store.write({ action: "put", reference: inbox, expected: null, content: original, provenance }));
    const base = success(await store.read({ reference: inbox }));
    const writers = roots.map((root, writer) => startRefWriter(root, { mode: "inbox", identity: "andrew", publish: false,
      input: { action: "put", reference: inbox, expected: base.version, content: incoming(base.content, writer), provenance } }, BURST_TIMEOUT_MS));
    await Promise.all(writers.map(({ ready }) => ready));
    writers.forEach(({ resume }) => resume());
    const reports = await Promise.all(writers.map(({ result }) => result));
    reports.forEach(assertWritten);
    assertInbox(success(await store.read({ reference: inbox })));
  }, BURST_TIMEOUT_MS);

  it("converges twenty simultaneously publishing clones on every accepted inbox write", async () => {
    const f = await refSyncFixture(layout), store = nativeStore(f.cloneA);
    const parent = await mkdtemp(join(tmpdir(), "arc-inbox-clones-"));
    onTestFinished(() => removeGitBackedDir(parent));
    success(await store.write({ action: "put", reference: inbox, expected: null, content: original, provenance }));
    assertPublished(success(await store.push()));
    const clients = [f.a, f.b];
    for (let writer = 2; writer < WRITERS; writer += 1) {
      const root = join(parent, `writer-${writer}`);
      await f.a.exec("git", ["clone", "--config", "gc.auto=0", "--config", "user.name=Inbox Writer", "--config", "user.email=inbox@example.test",
        "--config", "arc.identity=andrew", ...layout === "default" ? ["--config", "remote.origin.arc-state=push"] : [], f.origin, root]);
      clients.push(await createRefSyncCheckout(root, layout, f.origin));
    }
    const stores = clients.map(({ root }) => nativeStore(root));
    await Promise.all(stores.map(async (client) => {
      const pulled = success(await client.pull());
      expect(pulled.states).toEqual([]);
      expect(pulled.pulls.every(({ status, notices }) => status !== "failed" && notices.length === 0), JSON.stringify(pulled, null, 2)).toBe(true);
    }));
    const bases = await Promise.all(stores.map(async (client) => success(await client.read({ reference: inbox }))));
    expect(new Set(bases.map(({ version }) => version)).size).toBe(1);
    const writers = clients.map(({ root }, writer) => {
      const base = bases[writer]!;
      return startRefWriter(root, { mode: "inbox", identity: "andrew", publish: true,
        input: { action: "put", reference: inbox, expected: base.version, content: incoming(base.content, writer), provenance } }, BURST_TIMEOUT_MS);
    });
    await Promise.all(writers.map(({ ready }) => ready));
    writers.forEach(({ resume }) => resume());
    const reports = await Promise.all(writers.map(({ result }) => result));
    for (const report of reports) {
      assertWritten(report);
      if (!report.publication) throw new Error("The clone never attempted to publish its accepted write");
      expect(report.publicationAttempts?.at(-1)).toEqual(report.publication);
      assertPublished(success(report.publication));
    }
    const remoteTip = (await f.remote("git", ["rev-parse", personalRef])).stdout;
    const settled = await Promise.all(stores.map(async (client, index) => ({
      pull: await client.pull(), record: await client.read({ reference: inbox }),
      tip: (await clients[index]!.git(["rev-parse", personalRef])).stdout,
    })));
    for (const snapshot of settled) {
      const result = success(snapshot.pull);
      expect(result.states).toEqual([]);
      expect(result.pulls.every(({ status, notices }) => status !== "failed" && notices.length === 0), JSON.stringify(result, null, 2)).toBe(true);
      assertInbox(success(snapshot.record));
      expect(snapshot.tip).toBe(remoteTip);
    }
  }, BURST_TIMEOUT_MS);
});
