/** Operations bound to the separate store start again when a move into the default layout deletes it beneath them. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema, runStoreMigrate, runStoreRemote, type RecordReference } from "../../src/lib/store/index.js";
import type { RefStorePorts } from "../../src/lib/store/ports.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "start", lifecycleAction: "seed" };
const written = "Written before the move.\n";

/** A clone whose store sits in the separate layout behind a third repository, with origin holding the same state. */
async function separateFixture() {
  const h = await refSyncFixture("default");
  const primary = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
  const companion = (key: string): RecordReference => RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key });
  const before = companion("before");
  success(await h.a.store.write({ action: "put", reference: before, expected: null, content: written, provenance }));
  success(await h.a.store.write({ action: "put", expected: null, content: "# User Inbox\n", provenance,
    reference: RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "andrew" } }) }));
  success(await h.a.store.push());
  const state = join(h.a.root, "state.git"), storeDirectory = join(h.a.root, ".git", "arc", "store");
  await h.a.exec("git", ["init", "--bare", state]);
  const mirror = async () => {
    const refs = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
    await h.remote("git", ["push", "--atomic", state, ...refs.map((ref) => `${ref}:${ref}`)]);
  };
  await mirror();
  await h.a.exec("git", ["remote", "add", "state", state]);
  await h.a.exec("git", ["config", "remote.state.arc-state", "push"]);
  await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
  expect((await h.a.ports.fs.lstat(storeDirectory)).isDirectory()).toBe(true);
  const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : "";
  const moveIn = async () => {
    await h.a.exec("git", ["config", "remote.origin.arc-state", "push"]);
    await h.a.exec("git", ["config", "remote.state.arc-state", "off"]);
    expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
    await expect(h.a.ports.fs.lstat(storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  };
  return { ...h, companion, before, mirror, moveIn, storeDirectory, workRef: `refs/arc/work/${uid}` };
}

type Call = { args: readonly string[]; lock?: undefined } | { lock: string; args?: undefined };

/** Hold one operation at the first call `when` matches until the move has run; a lock is held while paused. */
function pausing(ports: RefStorePorts, when: (call: Call) => boolean) {
  let matched = false, announce: () => void = () => {}, resume: () => void = () => {};
  const reached = new Promise<void>((resolve) => { announce = resolve; });
  const resumed = new Promise<void>((resolve) => { resume = resolve; });
  const gate = async (call: Call) => {
    if (matched || !when(call)) return;
    matched = true; announce(); await resumed;
  };
  return { reached, resume, ports: { ...ports,
    exec: async (...args: Parameters<RefStorePorts["exec"]>) => { await gate({ args: args[1] }); return ports.exec(...args); },
    rawExec: async (...args: Parameters<RefStorePorts["rawExec"]>) => { await gate({ args: args[0] }); return ports.rawExec(...args); },
    lock: async (name: string, wait?: number) => { const release = await ports.lock(name, wait); await gate({ lock: name }); return release; },
  } satisfies RefStorePorts };
}

/** Run the move in while the operation is held, then let the operation finish. */
async function across<T>(paused: ReturnType<typeof pausing>, operation: Promise<T>, moveIn: () => Promise<void>): Promise<T> {
  try {
    await Promise.race([paused.reached, operation.then(() => { throw new Error("The operation ended before its pause"); })]);
    await moveIn();
  } finally { paused.resume(); }
  return operation;
}

const bound = (directory: string) => ({ args }: Call) => args?.includes(`--git-dir=${directory}`) === true;

it("restarts a pull whose merge held its ref locks while a move into the default layout deleted the store", async () => {
  const h = await separateFixture();
  const incoming = h.companion("incoming");
  success(await h.b.store.pull());
  success(await h.b.store.write({ action: "put", reference: incoming, expected: null, content: "Incoming during the move.\n", provenance }));
  success(await h.b.store.push());
  await h.mirror();
  let fetched = false;
  const paused = pausing(h.a.ports, ({ args, lock }) => { if (args?.includes("fetch")) fetched = true; return fetched && lock === h.workRef; });
  const pulled = success(await across(paused, createRefStore(paused.ports).pull(), h.moveIn));
  expect(pulled.pulls).toContainEqual(expect.objectContaining({ remote: "origin", status: "pulled" }));
  expect(success(await h.a.store.read({ reference: incoming })).content).toBe("Incoming during the move.\n");
}, 60_000);

it("restarts a write holding its batch's ref locks while a move into the default layout deleted the store", async () => {
  const h = await separateFixture();
  const during = h.companion("during");
  const paused = pausing(h.a.ports, ({ lock }) => lock === h.workRef);
  success(await across(paused, createRefStore(paused.ports).write({ action: "put", reference: during, expected: null, content: "Written across the move.\n", provenance }), h.moveIn));
  expect(success(await h.a.store.read({ reference: during })).content).toBe("Written across the move.\n");
  expect(success(await h.a.store.read({ reference: h.before })).content).toBe(written);
}, 60_000);

it("restarts a read bound to the separate store a move into the default layout deleted", async () => {
  const h = await separateFixture();
  const paused = pausing(h.a.ports, bound(h.storeDirectory));
  expect(success(await across(paused, createRefStore(paused.ports).read({ reference: h.before }), h.moveIn)).content).toBe(written);
}, 60_000);

it("restarts maintenance bound to the separate store a move into the default layout deleted", async () => {
  const h = await separateFixture();
  const paused = pausing(h.a.ports, bound(h.storeDirectory));
  const maintained = success(await across(paused, createRefStore(paused.ports).maintain(), h.moveIn));
  expect(maintained.measurements).toContainEqual(expect.objectContaining({ ref: "refs/arc/user/andrew/personal" }));
}, 60_000);

it("restarts the remote view bound to the separate store a move into the default layout deleted", async () => {
  const h = await separateFixture();
  const paused = pausing(h.a.ports, ({ args }) => bound(h.storeDirectory)({ args: args ?? [] }) && args?.includes("config") === true);
  const viewed = await across(paused, runStoreRemote(paused.ports, {}), h.moveIn);
  expect(viewed).toMatchObject({ status: "ok", result: { layout: "default", remotes: expect.arrayContaining([expect.objectContaining({ name: "origin", role: "push" })]) } });
}, 60_000);

it("restarts a version whose native config read meets the separate store's removal", async () => {
  const h = await separateFixture();
  let paused = false, announce!: () => void, resume!: () => void;
  const reached = new Promise<void>(resolve => { announce = resolve; });
  const resumed = new Promise<void>(resolve => { resume = resolve; });
  const store = createRefStore({ ...h.a.ports, fs: { ...h.a.ports.fs, readFile: async path => {
    if (!paused && path === join(h.storeDirectory, "config")) { paused = true; announce(); await resumed; }
    return h.a.ports.fs.readFile(path);
  } } });
  const operation = store.version().catch((error: unknown) => error);
  try {
    await Promise.race([reached, operation.then(() => { throw new Error("Version ended before reading the bound config"); })]);
    await h.moveIn();
  } finally { resume(); }
  expect(await operation).toEqual(await h.a.store.version());
}, 60_000);
