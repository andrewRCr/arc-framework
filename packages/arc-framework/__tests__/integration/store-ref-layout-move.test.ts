/** Ref-preserving local layout moves through the public command entries. */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createReadSourceStore, createRefStore, createKindRegistry, HistoryRefSchema, PushResultSchema, MigrateReportSchema, RecordReferenceSchema, runStoreMigrate, runStoreRemote,
  type StoreCommandResult, type MigrateReport, type Store, type RecordReference, type WriteCheck } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createRefSyncCheckout, preparedRefSync } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "start", lifecycleAction: "seed" };

async function layoutFixture() {
  const h = await preparedRefSync("layout state", "default", async (h) => {
    const primary = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    const ended = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended" } }),
      content: makeMetaFixture("ended"), placement: { kind: "active" }, provenance }));
    success(await h.a.store.write({ action: "put", reference: ended.reference, expected: success(await h.a.store.read({ reference: ended.reference })).version, content: makeMetaFixture("ended"),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    for (const [kind, owner, content] of [
      ["cohort/document", { type: "cohort", name: "group" }, "# Group\n\n**Purpose:** Group the work.\n"],
      ["project-registry/identity", { type: "project", name: "project" }, '{"projectId":"34567890-1234-4234-8234-123456789abc"}'],
      ["personal/inbox", { type: "person", name: "andrew" }, "# User Inbox\n"],
    ] as const) success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind, owner }), content, provenance }));
    const uid = "uid" in primary.reference.owner ? primary.reference.owner.uid : "";
    const tip = (await h.a.git(["rev-parse", `refs/arc/work/${uid}`])).stdout;
    await h.a.git(["update-ref", `refs/arc-remotes/upstream/work/${uid}`, tip]);
    await h.a.git(["update-ref", `refs/arc/tmp/seen/upstream/work/${uid}`, tip]);
    await h.a.git(["update-ref", "refs/arc/tmp/migrate/disposable", tip]);
    const sourceVersion = success(await createReadSourceStore(h.a.ports, "upstream").version());
    const version = success(await h.a.store.version());
    const before = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/", "refs/arc-remotes/"])).stdout
      .split("\n").filter((line) => line && !line.startsWith("refs/arc/tmp/migrate/")).sort();
    return { primary, sourceVersion, version, before, storeDirectory: join(h.a.root, ".git", "arc", "store") };
  });
  return { ...h, source: createReadSourceStore(h.a.ports, "upstream") };
}

function report(result: StoreCommandResult<MigrateReport>): MigrateReport {
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status !== "ok") throw new Error("Layout move refused");
  return MigrateReportSchema.parse(result.result);
}

describe.each(["migrate", "remote"] as const)("layout round trip through %s", (entry) => {
  it("carries every state namespace, tracking ref, and keeper without moving migration refs", async () => {
    const h = await layoutFixture();
    const remoteBefore = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
    let into: MigrateReport;
    if (entry === "migrate") {
      await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
      const moved = await runStoreMigrate(h.a.ports);
      if (moved.status === "designation-needed") throw new Error("Unexpected designation question");
      into = report(moved);
    } else {
      const moved = await runStoreRemote(h.a.ports, { remote: "origin", role: "off" });
      expect(moved.status, JSON.stringify(moved)).toBe("ok");
      if (moved.status !== "ok" || !moved.result.report) throw new Error("No setting's move report");
      into = MigrateReportSchema.parse(moved.result.report);
    }
    expect(into.move).toBe("layout");
    expect(into.refs.map(({ ref }) => ref).sort()).toEqual(h.before.map((line) => line.split(" ")[0]).sort());
    const personal = "refs/arc/user/andrew/personal";
    expect(into.refs.filter(({ scope }) => scope === "identity")).toEqual([{ ref: personal, scope: "identity", person: "andrew", action: "copy" }]);
    expect(into.refs.filter(({ ref }) => ref !== personal).every(({ scope, person }) => scope === "project" && person === undefined)).toBe(true);
    const copied = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/", "refs/arc-remotes/"])).stdout.split("\n").filter(Boolean).sort();
    expect(copied).toEqual(h.before);
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/", "refs/arc/history/", "refs/arc-remotes/"])).stdout).toBe("");
    expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
    expect(success(await h.a.store.version())).toBe(h.version);
    expect(success(await h.source.version())).toBe(h.sourceVersion);
    if (entry === "migrate") {
      await h.a.exec("git", ["config", "remote.origin.arc-state", "push"]);
      const moved = await runStoreMigrate(h.a.ports);
      if (moved.status === "designation-needed") throw new Error("Unexpected designation question");
      report(moved);
    } else {
      const moved = await runStoreRemote(h.a.ports, { remote: "origin", role: "push" });
      expect(moved.status, JSON.stringify(moved)).toBe("ok");
    }
    await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/", "refs/arc-remotes/"])).stdout.split("\n").filter(Boolean).sort()).toEqual(h.before);
    expect(success(await h.a.store.version())).toBe(h.version);
    expect(success(await h.source.version())).toBe(h.sourceVersion);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(remoteBefore);
  });
});


describe.each([
  { destination: "separate", entry: "setting", steps: ["rename", "designation"] },
  { destination: "default", entry: "setting", steps: ["record", "designation", "delete"] },
  { destination: "separate", entry: "no target", steps: ["rename", "delete"] },
  { destination: "default", entry: "no target", steps: ["rename"] },
] as const)("interrupted layout move into $destination from $entry", ({ destination, entry, steps }) => {
  it.each(steps)("resumes after interruption before %s", async (step) => {
    const h = await layoutFixture();
    if (destination === "default") {
      const initial = await runStoreRemote(h.a.ports, { remote: "origin", role: "off" });
      expect(initial.status, JSON.stringify(initial)).toBe("ok");
    }
    const role = destination === "default" ? "push" : "off";
    if (entry === "no target") await h.a.exec("git", ["config", "remote.origin.arc-state", role]);
    const ports = { ...h.a.ports, migrateStep: async (name: string) => {
      if (name === `layout.${step}`) throw new Error(`Interrupted before ${name}`);
    } };
    await expect(entry === "setting" ? runStoreRemote(ports, { remote: "origin", role }) : runStoreMigrate(ports))
      .rejects.toThrow(`Interrupted before layout.${step}`);
    if (step !== "record") {
      const record = JSON.parse((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout);
      expect(record).toMatchObject({ kind: "layout", source: destination === "default" ? "separate" : "default", destination });
      const resumed = await runStoreMigrate(h.a.ports);
      expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
    } else {
      const resumed = await runStoreRemote(h.a.ports, { remote: "origin", role });
      expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
    }
    if (destination === "separate") expect((await h.a.ports.fs.lstat(h.storeDirectory)).isDirectory()).toBe(true);
    else await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await h.a.exec("git", ["config", "--get", "remote.origin.arc-state"])).stdout).toBe(role);
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
    expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
    expect(success(await h.a.store.version())).toBe(h.version);
    expect(success(await h.source.version())).toBe(h.sourceVersion);
  });
});


type CopyMode = "live" | "source-end" | "reopen" | "late-write" | "two-ends";

async function endAlpha(store: Store,
  reference: RecordReference, quarter: string) {
  success(await store.write({ action: "put", reference, expected: success(await store.read({ reference })).version,
    content: makeMetaFixture("alpha"), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse(quarter) },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
}

async function divergentLayoutFixture(mode: CopyMode = "live") {
  const h = await layoutFixture();
  if (mode === "reopen") await endAlpha(h.a.store, h.primary.reference, "2026-q4");
  success(await h.a.store.push());
  success(await h.b.store.pull());
  if (mode === "reopen") success(await h.b.store.pull({ history: [HistoryRefSchema.parse(
    `refs/arc/history/work/${"uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : ""}`,
  )] }));
  const into = await runStoreRemote(h.a.ports, { remote: "origin", role: "off" });
  expect(into.status, JSON.stringify(into)).toBe("ok");
  if (mode === "reopen") success(await h.a.store.write({ action: "put", reference: h.primary.reference,
    expected: success(await h.a.store.read({ reference: h.primary.reference })).version, content: makeMetaFixture("alpha"),
    placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  const source = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: h.primary.reference.owner, key: "source" });
  const destination = RecordReferenceSchema.parse({ ...source, key: "destination" });
  success(await h.a.store.write({ action: "put", reference: source, expected: null, content: "Source edit.\n", provenance: { verb: "edit", lifecycleAction: "save" } }));
  success(await h.b.store.write({ action: "put", reference: destination, expected: null, content: "Destination edit.\n", provenance: { verb: "edit", lifecycleAction: "save" } }));
  const other = success(await h.b.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "destination-only" } }),
    content: makeMetaFixture("destination-only"), placement: { kind: "active" }, provenance }));
  if (mode === "source-end" || mode === "two-ends") await endAlpha(h.a.store, h.primary.reference, "2026-q4");
  if (mode === "late-write" || mode === "two-ends") await endAlpha(h.b.store, h.primary.reference, "2026-q3");
  const refs = (await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.split("\n").filter((ref) => ref && !ref.startsWith("refs/arc/tmp/"));
  await h.b.git(["push", h.a.root, ...refs.map((ref) => `${ref}:${ref}`)]);
  return { ...h, sourceEdit: source, destinationEdit: destination, other };
}

it("merges a pre-existing destination without losing either copy's records", async () => {
  const h = await divergentLayoutFixture();
  const source = h.sourceEdit, destination = h.destinationEdit, other = h.other;
  const moved = await runStoreRemote(h.a.ports, { remote: "origin", role: "push" });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect(success(await h.a.store.read({ reference: destination })).content).toBe("Destination edit.\n");
  expect(success(await h.a.store.read({ reference: source })).content).toBe("Source edit.\n");
  expect(success(await h.a.store.read({ reference: other.reference })).content).toBe(makeMetaFixture("destination-only"));
  if (moved.status !== "ok") throw new Error("Destination copy refused");
  expect(moved.result.report?.refs).toContainEqual(expect.objectContaining({ ref: `refs/arc/work/${"uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : ""}`, action: "merge" }));
});


it.each(["source-end", "reopen", "late-write", "two-ends"] as const)("preserves the destination lifecycle when copying %s", async (mode) => {
  const h = await divergentLayoutFixture(mode);
  const moved = await runStoreRemote(h.a.ports, { remote: "origin", role: "push" });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  const primary = success(await h.a.store.read({ reference: h.primary.reference }));
  expect(primary.placement?.kind).toBe(mode === "reopen" ? "active" : "completed");
  if (mode === "two-ends") expect(primary.placement).toMatchObject({ kind: "completed", quarter: "2026-q4" });
  expect(success(await h.a.store.read({ reference: h.sourceEdit })).content).toBe("Source edit.\n");
  expect(success(await h.a.store.read({ reference: h.destinationEdit })).content).toBe("Destination edit.\n");
  const uid = "uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : "";
  const live = `refs/arc/work/${uid}`, history = `refs/arc/history/work/${uid}`;
  const refs = (await h.a.git(["for-each-ref", "--format=%(refname)", live, history])).stdout.split("\n").filter(Boolean);
  expect(refs).toEqual([mode === "reopen" ? live : history]);
  if (moved.status !== "ok") throw new Error("Lifecycle copy refused");
  if (mode === "two-ends") {
    expect(moved.result.report?.notices).toContainEqual(expect.objectContaining({ condition: expect.stringMatching(/withdraw/iu) }));
    expect(moved.result.report?.refs).toContainEqual(expect.objectContaining({ ref: "refs/arc/archive/2026-q3", action: "merge" }));
  }
});


it.each([
  { destination: "separate", entry: "setting" }, { destination: "default", entry: "setting" }, { destination: "default", entry: "no target" },
] as const)("lands no partial destination when the $destination landing from $entry fails, then recovers", async ({ destination, entry }) => {
  const h = await layoutFixture();
  if (destination === "default") {
    const initial = await runStoreRemote(h.a.ports, { remote: "origin", role: "off" });
    expect(initial.status, JSON.stringify(initial)).toBe("ok");
  }
  const role = destination === "default" ? "push" : "off";
  if (entry === "no target") await h.a.exec("git", ["config", "remote.origin.arc-state", role]);
  const uid = "uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : "";
  const watched = `refs/arc/work/${uid}`;
  const format = (await h.a.exec("git", ["rev-parse", "--show-ref-format"])).stdout;
  const lock = join(h.a.root, ".git", ...(format === "reftable" ? ["reftable", "tables.list.lock"] : [`${watched}.lock`]));
  const codeRefs = async () => (await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/", "refs/arc-remotes/"])).stdout
    .split("\n").filter((line) => line && !line.startsWith("refs/arc/tmp/migrate/")).sort();
  const before = await codeRefs();
  let armed = true;
  const ports = { ...h.a.ports,
    fs: { ...h.a.ports.fs, rename: async (source: string, target: string) => {
      if (destination === "separate" && target === h.storeDirectory && armed) {
        armed = false; throw Object.assign(new Error("The destination rename is denied"), { code: "EACCES" });
      }
      await h.a.ports.fs.rename(source, target);
    } },
    execInput: async (...args: Parameters<typeof h.a.ports.execInput>) => {
      const [argv, input, options] = args;
      if (destination !== "default" || !armed || argv.some((arg) => arg.startsWith("--git-dir=")) || !argv.includes("update-ref") || !input.includes(` ${watched} `)) return h.a.ports.execInput(...args);
      armed = false;
      await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "held by native landing fixture\n");
      try { return await h.a.ports.execInput(argv.map((arg) => /^(?:core.filesRefLockTimeout|reftable.lockTimeout)=/u.test(arg) ? `${arg.split("=")[0]}=0` : arg), input, options); }
      finally { await rm(lock, { force: true }); }
    },
  };
  await expect(entry === "setting" ? runStoreRemote(ports, { remote: "origin", role }) : runStoreMigrate(ports))
    .rejects.toThrow(destination === "separate" ? /rename is denied/u : /cannot lock ref|lock.*exist/iu);
  expect(await codeRefs()).toEqual(before);
  if (destination === "separate") await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  else expect((await h.a.ports.fs.lstat(h.storeDirectory)).isDirectory()).toBe(true);
  expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
  const resumed = await runStoreMigrate(h.a.ports);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
  if (destination === "separate") expect((await h.a.ports.fs.lstat(h.storeDirectory)).isDirectory()).toBe(true);
  else await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
});


it("reports every broken copy rule while retaining the merged records", async () => {
  const h = await divergentLayoutFixture();
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const check: WriteCheck = async ({ reference, next, before, after, writer }) => {
    if (reference.key !== "source" || next?.content !== "Source edit.\n") return [];
    expect(writer).toEqual({ kind: "verb", verb: "sync", lifecycleAction: "merge" });
    expect(success(await before.read({ reference: h.destinationEdit })).content).toBe("Destination edit.\n");
    expect(success(await after.read({ reference: h.sourceEdit })).content).toBe("Source edit.\n");
    expect(success(await after.read({ reference: h.destinationEdit })).content).toBe("Destination edit.\n");
    return ["copy.one", "copy.two"].map((rule) => ({ rule, condition: "The combined state needs correction.", remedy: { text: "Review and save the combined state." } }));
  };
  const moved = await runStoreRemote({ ...h.a.ports, registry: { ...registry, "work-item/companion": { ...registry["work-item/companion"], check } } }, { remote: "origin", role: "push" });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  if (moved.status !== "ok") throw new Error("Advisory rules gated the copy");
  for (const rule of ["copy.one", "copy.two"]) expect(moved.result.report?.notices).toContainEqual({
    condition: expect.stringContaining(rule), remedy: { text: "Review and save the combined state." },
  });
  expect(success(await h.a.store.read({ reference: h.sourceEdit })).content).toBe("Source edit.\n");
  expect(success(await h.a.store.read({ reference: h.destinationEdit })).content).toBe("Destination edit.\n");
});

it("completes its copy while a writer holds the destination item's ref lock", async () => {
  const h = await divergentLayoutFixture();
  const ref = `refs/arc/work/${"uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : ""}`;
  const release = await h.a.ports.lock(ref);
  try {
    const moved = await runStoreRemote({ ...h.a.ports, lock: (name, wait) => h.a.ports.lock(name, name === "layout" || name === "migrate" ? wait : 1) }, { remote: "origin", role: "push" });
    expect(moved.status, JSON.stringify(moved)).toBe("ok");
    expect(success(await h.a.store.read({ reference: h.sourceEdit })).content).toBe("Source edit.\n");
    expect(success(await h.a.store.read({ reference: h.destinationEdit })).content).toBe("Destination edit.\n");
  } finally { await release(); }
});


it.each([
  { destination: "separate", operation: "pull" }, { destination: "separate", operation: "push" },
  { destination: "default", operation: "pull" }, { destination: "default", operation: "push" },
] as const)("stops state $operation between the rename and the designation of a move into $destination, then recovers", async ({ destination, operation }) => {
  const h = await layoutFixture();
  if (destination === "default") expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  const remoteBefore = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const between = destination === "default" ? "layout.rename" : "layout.designation";
  await expect(runStoreRemote({ ...h.a.ports, migrateStep: (step) => step === between
    ? Promise.reject(new Error("Stop between rename and designation")) : Promise.resolve() },
  { remote: "origin", role: destination === "default" ? "push" : "off" })).rejects.toThrow("Stop between rename and designation");
  const result = success(await h.a.store[operation]());
  expect(result.states).toContainEqual(expect.objectContaining({ status: "move-incomplete", condition: expect.stringMatching(/store|layout/iu), remedy: expect.objectContaining({ argv: ["arc", "store", "migrate"] }) }));
  expect(result.pulls).toEqual([]);
  if (operation === "push") expect(PushResultSchema.parse(result).publishes).toEqual([]);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(remoteBefore);
  const resumed = await runStoreMigrate(h.a.ports);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  expect(success(await h.a.store[operation]()).states.some(({ status }) => status === "move-incomplete")).toBe(false);
});

it.each(["default", "separate"] as const)("reports unfinished cleanup while continuing to sync in the %s destination", async (destination) => {
  const h = await layoutFixture();
  if (destination === "default") expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  await expect(runStoreRemote({ ...h.a.ports, migrateStep: (step) => step === "layout.delete"
    ? Promise.reject(new Error("Stop before source delete")) : Promise.resolve() }, { remote: "origin", role: destination === "default" ? "push" : "off" })).rejects.toThrow("Stop before source delete");
  for (const operation of ["pull", "push"] as const) {
    const result = success(await h.a.store[operation]());
    expect(result.states).toContainEqual(expect.objectContaining({ status: "move-unfinished", remedy: expect.objectContaining({ argv: ["arc", "store", "migrate"] }) }));
    if (destination === "separate") expect(result.states).toContainEqual({ status: "no-remote" });
    else {
      expect(result.pulls).toContainEqual(expect.objectContaining({ role: "state", remote: "origin", status: expect.stringMatching(/pulled|noop/u) }));
      if (operation === "push") expect(PushResultSchema.parse(result).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
    }
  }
  if (destination === "default") expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toContain(`refs/arc/work/${"uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : ""}`);
  const resumed = await runStoreMigrate(h.a.ports);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  expect(success(await h.a.store.pull()).states.some(({ status }) => status === "move-unfinished")).toBe(false);
});

describe.each(["rename", "push-default"] as const)("external remote edit: %s", (edit) => {
  it.each(["pull", "push"] as const)("keeps held state in place and reports the layout mismatch before %s", async (operation) => {
    const h = await layoutFixture();
    await h.a.exec("git", ["remote", "add", "other", h.origin]);
    await h.a.exec("git", ["config", "remote.other.arc-state", "off"]);
    if (edit === "rename") await h.a.exec("git", ["remote", "rename", "origin", "state"]);
    if (edit === "push-default") await h.a.exec("git", ["config", "remote.pushDefault", "other"]);
    const result = success(await h.a.store[operation]());
    expect(result.states).toContainEqual(expect.objectContaining({ status: "move-incomplete", remedy: expect.objectContaining({ argv: ["arc", "store", "migrate"] }) }));
    expect(result.pulls).toEqual([]);
    if (operation === "push") expect(PushResultSchema.parse(result).publishes).toEqual([]);
    await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
    const resumed = await runStoreMigrate(h.a.ports);
    expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
    expect((await h.a.ports.fs.lstat(h.storeDirectory)).isDirectory()).toBe(true);
    expect(success(await h.a.store.pull()).states.some(({ status }) => status === "move-incomplete")).toBe(false);
  });
});

it("keeps a held store in place when a remote is added beside a lone remote not named origin, then recovers", async () => {
  const h = await layoutFixture();
  await h.a.exec("git", ["remote", "rename", "origin", "state"]);
  const pushed = PushResultSchema.parse(success(await h.a.store.push()));
  expect(pushed.states).toEqual([]);
  expect(pushed.publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  const live = `refs/arc/work/${"uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : ""}`;
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe(live);
  await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  await h.a.exec("git", ["remote", "add", "other", h.origin]);
  await h.a.exec("git", ["config", "remote.other.arc-state", "off"]);
  const remoteBefore = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const result = success(await h.a.store.pull());
  expect(result.states).toContainEqual(expect.objectContaining({ status: "move-incomplete", remedy: expect.objectContaining({ argv: ["arc", "store", "migrate"] }) }));
  expect(result.pulls).toEqual([]);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(remoteBefore);
  await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
  const resumed = await runStoreMigrate(h.a.ports);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  expect((await h.a.ports.fs.lstat(h.storeDirectory)).isDirectory()).toBe(true);
  const next = success(await h.a.store.pull());
  expect(next.states.some(({ status }) => status === "move-incomplete")).toBe(false);
  expect(next.pulls).toContainEqual(expect.objectContaining({ remote: "state", role: "state" }));
});


async function unrecordedBuildFixture() {
  const h = await layoutFixture();
  await expect(runStoreRemote({ ...h.a.ports, migrateStep: (step) => step === "layout.record"
    ? Promise.reject(new Error("Stop before record")) : Promise.resolve() }, { remote: "origin", role: "off" })).rejects.toThrow("Stop before record");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  return { ...h, buildDirectory: join(h.a.root, ".git", "arc", "store-migrate-build") };
}

it("removes an unrecorded build when no-target reconciliation needs no layout change", async () => {
  const h = await unrecordedBuildFixture();
  expect((await h.a.ports.fs.lstat(h.buildDirectory)).isDirectory()).toBe(true);
  const result = await runStoreMigrate(h.a.ports);
  expect(result.status, JSON.stringify(result)).toBe("ok");
  await expect(h.a.ports.fs.lstat(h.buildDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.a.exec("git", ["config", "--get", "remote.origin.arc-state"])).stdout).toBe("push");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/layout/"])).stdout).toBe("");
  expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
});

it("rebuilds from the current source after a ref was deleted following an unrecorded build", async () => {
  const h = await unrecordedBuildFixture();
  const tracking = `refs/arc-remotes/upstream/work/${"uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : ""}`;
  await h.a.git(["update-ref", "-d", tracking]);
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  await expect(h.a.ports.fs.lstat(h.buildDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.a.ports.fs.lstat(h.storeDirectory)).isDirectory()).toBe(true);
  expect((await h.a.exec("git", ["config", "--get", "remote.origin.arc-state"])).stdout).toBe("off");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", tracking])).stdout).toBe("");
  expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
  expect(success(await h.a.store.version())).toBe(h.version);
});

it("cleans an unrecorded source leftover without replacing the separate store's newer state", async () => {
  const h = await layoutFixture();
  const ref = `refs/arc/work/${"uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : ""}`;
  const old = (await h.a.git(["rev-parse", ref])).stdout;
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: h.primary.reference.owner, key: "newer" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "New authoritative edit.\n", provenance: { verb: "edit", lifecycleAction: "save" } }));
  await h.a.exec("git", ["update-ref", ref, old]);
  expect(success(await h.a.store.pull()).states).toContainEqual(expect.objectContaining({ status: "move-unfinished" }));
  const cleared = await runStoreMigrate(h.a.ports);
  expect(cleared.status).toBe("ok");
  if (cleared.status !== "ok") throw new Error("Source cleanup failed");
  expect(cleared.result.refs).toContainEqual({ ref, scope: "project", action: "delete" });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", ref])).stdout).toBe("");
  expect(success(await h.a.store.read({ reference })).content).toBe("New authoritative edit.\n");
  expect(success(await h.a.store.pull()).states.some(({ status }) => status === "move-unfinished")).toBe(false);
});


/** Refs other owners keep under `refs/arc/` in the code repository: an Errand identity's, notes sync's, delivery's. */
const FOREIGN_REFS = ["refs/arc/user/andrew/errands", "refs/arc/user/andrew/sync-state", "refs/arc/bootstrap/seed",
  "refs/arc/delivery-candidates/seed", "refs/arc/recovery/seed"];

async function foreignRefs(exec: Awaited<ReturnType<typeof layoutFixture>>["a"]["exec"], scope: string[] = []): Promise<string[]> {
  return (await exec("git", [...scope, "for-each-ref", "--format=%(refname) %(objectname)", ...FOREIGN_REFS])).stdout
    .split("\n").filter(Boolean).sort();
}

async function seedForeignRefs(h: Awaited<ReturnType<typeof layoutFixture>>): Promise<string[]> {
  const head = (await h.a.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  for (const ref of FOREIGN_REFS) await h.a.exec("git", ["update-ref", ref, head]);
  const seeded = await foreignRefs(h.a.exec);
  expect(seeded).toHaveLength(FOREIGN_REFS.length);
  return seeded;
}

describe("refs outside the store", () => {
  it.each(["migrate", "remote"] as const)("stay in the code repository through a move out and back by %s", async (entry) => {
    const h = await layoutFixture();
    const seeded = await seedForeignRefs(h);
    const move = async (role: "push" | "off"): Promise<MigrateReport> => {
      if (entry === "migrate") {
        await h.a.exec("git", ["config", "remote.origin.arc-state", role]);
        const moved = await runStoreMigrate(h.a.ports);
        if (moved.status === "designation-needed") throw new Error("Unexpected designation question");
        return report(moved);
      }
      const moved = await runStoreRemote(h.a.ports, { remote: "origin", role });
      expect(moved.status, JSON.stringify(moved)).toBe("ok");
      if (moved.status !== "ok" || !moved.result.report) throw new Error("No setting's move report");
      return MigrateReportSchema.parse(moved.result.report);
    };
    const out = await move("off");
    expect(out.refs.map(({ ref }) => ref).filter((ref) => FOREIGN_REFS.includes(ref))).toEqual([]);
    expect(await foreignRefs(h.a.exec)).toEqual(seeded);
    expect(await foreignRefs(h.a.exec, [`--git-dir=${h.storeDirectory}`])).toEqual([]);
    const back = await move("push");
    expect(back.refs.map(({ ref }) => ref).filter((ref) => FOREIGN_REFS.includes(ref))).toEqual([]);
    await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await foreignRefs(h.a.exec)).toEqual(seeded);
    expect(success(await h.a.store.version())).toBe(h.version);
  });

  it.each(["no target", "setting"] as const)("stay through the separate layout's %s cleanup, which still deletes a store leftover", async (entry) => {
    const h = await layoutFixture();
    const leftover = `refs/arc/work/${"uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : ""}`;
    const old = (await h.a.git(["rev-parse", leftover])).stdout.trim();
    expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
    const seeded = await seedForeignRefs(h);
    await h.a.exec("git", ["update-ref", leftover, old]);
    const cleaned = entry === "no target" ? await runStoreMigrate(h.a.ports) : await runStoreRemote(h.a.ports, { remote: "origin", role: "off" });
    expect(cleaned.status, JSON.stringify(cleaned)).toBe("ok");
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", leftover])).stdout).toBe("");
    expect(await foreignRefs(h.a.exec)).toEqual(seeded);
    expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
  });
});


it("finishes the recorded direction and leaves a subsequent designation change to the next run", async () => {
  const h = await layoutFixture();
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  await h.a.exec("git", ["config", "remote.origin.arc-state", "push"]);
  await expect(runStoreMigrate({ ...h.a.ports, migrateStep: (step) => step === "layout.delete"
    ? Promise.reject(new Error("Stop after recorded switch")) : Promise.resolve() })).rejects.toThrow("Stop after recorded switch");
  await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: h.primary.reference.owner, key: "new-after-switch" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Keep the authoritative edit.\n", provenance: { verb: "edit", lifecycleAction: "save" } }));
  const finished = await runStoreMigrate(h.a.ports);
  expect(finished, JSON.stringify(finished)).toMatchObject({ status: "ok", result: { move: "layout" } });
  await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  const result = await runStoreMigrate({ ...h.a.ports, migrateStep: async (step) => {
    if (step !== "layout.build") return;
    await expect(h.a.ports.fs.lstat(join(h.a.root, ".git", "arc", "store-migrate-old"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  } });
  expect(result.status, JSON.stringify(result)).toBe("ok");
  expect((await h.a.ports.fs.lstat(h.storeDirectory)).isDirectory()).toBe(true);
  expect(success(await h.a.store.read({ reference })).content).toBe("Keep the authoritative edit.\n");
  expect(success(await h.a.store.pull()).states).toEqual([{ status: "no-remote" }]);
});


function startLayoutWorker(root: string, role: "push" | "off", stopBefore: string) {
  const env = { ...process.env }; delete env.FORCE_COLOR;
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../fixtures/store/ref-layout-worker.ts", import.meta.url)), root, JSON.stringify({ role, stopBefore })], { stdio: ["pipe", "pipe", "pipe"], env });
  let errors = "", announce: () => void = () => {}, fail: (error: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => { announce = resolve; fail = reject; });
  void ready.catch(() => {});
  const timeout = setTimeout(() => { child.kill("SIGKILL"); fail(new Error(`Layout worker did not pause: ${errors}`)); }, 20_000);
  child.stderr.on("data", (data: Buffer) => { errors += data.toString(); });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => { if (line === "READY") { clearTimeout(timeout); announce(); } });
  child.on("error", fail);
  const closed = new Promise<void>((resolve) => { child.on("close", () => { clearTimeout(timeout); fail(new Error(`Layout worker exited: ${errors}`)); resolve(); }); });
  onTestFinished(async () => { child.kill("SIGKILL"); await closed; });
  return { ready, stop: async () => { child.kill("SIGKILL"); await closed; } };
}

it("resumes a killed move process into the separate layout", async () => {
  const h = await layoutFixture();
  const worker = startLayoutWorker(h.a.root, "off", "layout.designation");
  await worker.ready;
  await worker.stop();
  expect(success(await h.a.store.pull()).states).toContainEqual(expect.objectContaining({ status: "move-incomplete" }));
  const resumed = await runStoreMigrate(h.a.ports);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
  expect(success(await h.a.store.version())).toBe(h.version);
  expect(success(await h.source.version())).toBe(h.sourceVersion);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
}, 30_000);

it.each(["default", "separate", "local-only"] as const)("lands a second worktree's whole batch in the %s destination after a layout-lock retry", async (destination) => {
  const h = await layoutFixture();
  if (destination === "default") expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: h.primary.reference.owner, key: "racing-writer" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Before the move.\n", provenance: { verb: "edit", lifecycleAction: "save" } }));
  const prior = success(await h.a.store.read({ reference }));
  const linked = join(h.a.root, "linked-writer");
  await h.a.exec("git", ["worktree", "add", "-b", "layout-writer", linked]);
  const checkout = await createRefSyncCheckout(linked, "default", h.origin);
  const writer = createRefStore({ ...checkout.ports, lock: (name, wait) => checkout.ports.lock(name, name === "layout" ? 1 : wait) });
  if (destination === "separate") {
    await h.a.exec("git", ["remote", "add", "fork", h.origin]);
    await h.a.exec("git", ["config", "remote.fork.arc-state", "off"]);
    await h.a.exec("git", ["config", "remote.pushDefault", "fork"]);
  }
  let announce: () => void = () => {}, resume: () => void = () => {};
  const paused = new Promise<void>((resolve) => { announce = resolve; });
  const continueMove = new Promise<void>((resolve) => { resume = resolve; });
  const ports = { ...h.a.ports, migrateStep: async (step: string) => { if (step === "layout.rename") { announce(); await continueMove; } } };
  const moving = destination === "separate" ? runStoreMigrate(ports) : runStoreRemote(ports, { remote: "origin", role: destination === "default" ? "push" : "off" });
  const batch = { provenance, writes: [
    { action: "put" as const, expected: null, reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "created-by-writer" } }),
      content: makeMetaFixture("created-by-writer"), placement: { kind: "active" as const } },
    { action: "put" as const, expected: prior.version, reference, content: "After the move.\n" },
  ] };
  try {
    await paused;
    expect(await writer.batch(batch)).toMatchObject({ status: "refused", refusal: { code: "lock-held" } });
    expect(await writer.read({ reference: batch.writes[0]!.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await writer.read({ reference })).content).toBe("Before the move.\n");
  } finally { resume(); await moving; }
  const applied = success(await writer.batch(batch));
  expect(applied.writes).toHaveLength(2);
  const created = applied.writes[0]?.reference;
  if (!created) throw new Error("No created work item");
  expect(success(await h.a.store.read({ reference: created })).content).toBe(makeMetaFixture("created-by-writer"));
  expect(success(await h.a.store.read({ reference })).content).toBe("After the move.\n");
  if (destination === "default") await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  else expect((await h.a.ports.fs.lstat(h.storeDirectory)).isDirectory()).toBe(true);
}, 30_000);

it.each(["separate", "local-only", "default"] as const)("does not publish a sync that pulled before the switch to %s", async (destination) => {
  const h = await layoutFixture();
  const state = join(h.a.root, "state.git");
  if (destination === "default") {
    success(await h.a.store.push());
    await h.a.exec("git", ["init", "--bare", state]);
    const published = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
    await h.remote("git", ["push", "--atomic", state, ...published.map((ref) => `${ref}:${ref}`)]);
    for (const clone of [h.a, h.b]) {
      await clone.exec("git", ["remote", "add", "state", state]);
      await clone.exec("git", ["config", "remote.state.arc-state", "push"]);
      await clone.exec("git", ["config", "remote.origin.arc-state", "off"]);
      expect((await runStoreMigrate(clone.ports)).status).toBe("ok");
    }
  }
  const old = async () => destination === "default"
    ? (await h.a.exec("git", [`--git-dir=${state}`, "for-each-ref", "--format=%(refname) %(objectname)"])).stdout
    : (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  success(await h.a.store.push());
  success(await h.b.store.pull());
  const remoteReference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: h.primary.reference.owner, key: "remote-change" });
  success(await h.b.store.write({ action: "put", reference: remoteReference, expected: null, content: "Incoming before the switch.\n", provenance }));
  success(await h.b.store.push());
  const localReference = RecordReferenceSchema.parse({ ...remoteReference, key: "unpublished" });
  success(await h.a.store.write({ action: "put", reference: localReference, expected: null, content: "Local intent.\n", provenance }));
  const before = await old();
  let fetched = false, merged = false, stopped = false, held = false, announce: () => void = () => {}, resume: () => void = () => {};
  const paused = new Promise<void>((resolve) => { announce = resolve; });
  const continued = new Promise<void>((resolve) => { resume = resolve; });
  const uid = "uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : "";
  const ports = { ...h.a.ports,
    exec: async (...args: Parameters<typeof h.a.ports.exec>) => {
      const result = await h.a.ports.exec(...args);
      if (args[1].includes("fetch")) fetched = true;
      if (merged && held && !stopped && args[1].includes("for-each-ref") && args[1].at(-1) === "refs/arc/") {
        stopped = true; announce(); await continued;
      }
      return result;
    },
    lock: async (name: string, wait?: number) => {
      const release = await h.a.ports.lock(name, wait);
      if (name === `refs/arc/work/${uid}`) held = true;
      return async () => {
        await release();
        if (name === "layout" && fetched) merged = true;
        if (name === `refs/arc/work/${uid}`) held = false;
      };
    },
  };
  const pushing = createRefStore(ports).push();
  try {
    await Promise.race([paused, pushing.then(() => { throw new Error("Push ended before its captured listing"); })]);
    expect(success(await h.a.store.read({ reference: remoteReference })).content).toBe("Incoming before the switch.\n");
    if (destination === "separate") {
      const next = join(h.a.root, "next-state.git");
      await h.a.exec("git", ["init", "--bare", next]);
      await h.a.exec("git", ["remote", "add", "fork", next]);
      await h.a.exec("git", ["config", "remote.fork.arc-state", "push"]);
      await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
      expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
    } else if (destination === "default") {
      await h.a.exec("git", ["config", "remote.origin.arc-state", "push"]);
      await h.a.exec("git", ["config", "remote.state.arc-state", "off"]);
      expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
      await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    } else expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  } finally { resume(); }
  PushResultSchema.parse(success(await pushing));
  expect(await old()).toBe(before);
  expect(success(await h.a.store.read({ reference: localReference })).content).toBe("Local intent.\n");
}, 30_000);

it.each(["separate", "default"] as const)("detects a rewritten remote after moving into %s and recovers after repair", async (destination) => {
  const h = await layoutFixture();
  success(await h.a.store.push());
  const uid = "uid" in h.primary.reference.owner ? h.primary.reference.owner.uid : "";
  const ref = `refs/arc/work/${uid}`;
  const first = (await h.remote("git", ["rev-parse", ref])).stdout;
  const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: h.primary.reference.owner, key: "preserved-write" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Preserve the published write.\n", provenance }));
  success(await h.a.store.push());
  const latest = (await h.remote("git", ["rev-parse", ref])).stdout;
  await h.a.exec("git", ["remote", "add", "fork", h.origin]);
  await h.a.exec("git", ["config", "remote.fork.arc-state", "off"]);
  await h.a.exec("git", ["config", "remote.pushDefault", "fork"]);
  expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
  if (destination === "default") {
    await h.a.exec("git", ["config", "remote.pushDefault", "origin"]);
    expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
  }
  await h.remote("git", ["update-ref", ref, first, latest]);
  const pulled = success(await h.a.store.pull());
  expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "history-diverged", ref }));
  expect(success(await h.a.store.read({ reference })).content).toBe("Preserve the published write.\n");
  await h.remote("git", ["update-ref", ref, latest, first]);
  expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "history-diverged")).toBe(false);
}, 30_000);

async function localState(h: Awaited<ReturnType<typeof layoutFixture>>) {
  return {
    refs: (await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/", "refs/arc-remotes/"])).stdout,
    config: (await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout,
  };
}

it("refuses leaving the source with no target, naming --to, and changes nothing", async () => {
  const h = await layoutFixture(), before = await localState(h);
  expect(await invokeStoreMigrate(["--leave-source"], h.a.ports))
    .toMatchObject({ status: "refused", refusal: { code: "request-invalid", class: "terminal", condition: expect.stringContaining("--to") } });
  expect(await localState(h)).toEqual(before);
  await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
});

it("gives a clone with no state remote an actionable designation remedy for --to", async () => {
  const h = await layoutFixture();
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  for (const to of ["next", "https://example.invalid/state.git"]) {
    expect(await invokeStoreMigrate(["--to", to], h.a.ports)).toMatchObject({ status: "refused", refusal: { code: "no-state-remote", class: "recoverable",
      remedy: { text: expect.stringMatching(/arc store remote <remote> push.*arc store remote backing push/u) } } });
  }
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "push" })).status).toBe("ok");
  expect(await invokeStoreMigrate(["--to", "next"], h.a.ports)).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "unreachable", class: "recoverable" } } });
});

it("leaves refs, roles, and the physical store unchanged for a trial request with no target", async () => {
  const h = await layoutFixture();
  await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const before = await localState(h);
  const refused = await runStoreMigrate(h.a.ports, { trial: true });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "request-invalid", class: "terminal", condition: expect.stringContaining("--trial") } });
  expect(await localState(h)).toEqual(before);
  await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
  expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
  expect((await h.a.ports.fs.lstat(h.storeDirectory)).isDirectory()).toBe(true);
  expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
});

describe("remote moves beside an unsettled layout", () => {
  const recordTip = async (h: Awaited<ReturnType<typeof layoutFixture>>) =>
    (await h.a.exec("git", ["for-each-ref", "--format=%(objectname)", "refs/arc/tmp/migrate/move"])).stdout;
  const destination = async (h: Awaited<ReturnType<typeof layoutFixture>>) => {
    const path = join(dirname(h.a.root), "elsewhere.git");
    await h.a.exec("git", ["init", "--bare", path]);
    return path;
  };

  it.each([true, false])("refuses a remote move while a layout record stands and keeps the record (trial: %s)", async (trial) => {
    const h = await layoutFixture();
    success(await h.a.store.push());
    expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
    await expect(runStoreRemote({ ...h.a.ports, migrateStep: (step) => step === "layout.delete"
      ? Promise.reject(new Error("Stop before source delete")) : Promise.resolve() }, { remote: "origin", role: "push" })).rejects.toThrow("Stop before source delete");
    const to = await destination(h), record = await recordTip(h);
    const config = (await h.a.exec("git", ["config", "--list", "--local"])).stdout;
    expect(record).not.toBe("");
    expect(await runStoreMigrate(h.a.ports, { to, ...trial ? { trial } : {} })).toMatchObject({ status: "refused",
      refusal: { code: "move-unfinished", remedy: { argv: ["arc", "store", "migrate"] } } });
    expect(await recordTip(h)).toBe(record);
    expect((await h.a.exec("git", ["config", "--list", "--local"])).stdout).toBe(config);
    expect((await h.a.ports.fs.lstat(join(h.a.root, ".git", "arc", "store-migrate-old"))).isDirectory()).toBe(true);
    expect((await h.a.exec("git", ["--git-dir", to, "for-each-ref"])).stdout).toBe("");
    expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
  });

  it("refuses leaving the source while a layout record stands, recoverably naming arc store migrate", async () => {
    const h = await layoutFixture();
    success(await h.a.store.push());
    expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
    await expect(runStoreRemote({ ...h.a.ports, migrateStep: (step) => step === "layout.delete"
      ? Promise.reject(new Error("Stop before source delete")) : Promise.resolve() }, { remote: "origin", role: "push" })).rejects.toThrow("Stop before source delete");
    const record = await recordTip(h);
    expect(await invokeStoreMigrate(["--leave-source"], h.a.ports)).toMatchObject({ status: "refused",
      refusal: { code: "move-unfinished", class: "recoverable", remedy: { argv: ["arc", "store", "migrate"] } } });
    expect(await recordTip(h)).toBe(record);
    expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
    expect(await recordTip(h)).toBe("");
  });

  it.each(["push-default", "removal"] as const)("refuses move-incomplete before copying or recording after an external %s edit", async (edit) => {
    const h = await layoutFixture();
    success(await h.a.store.push());
    if (edit === "push-default") {
      await h.a.exec("git", ["remote", "add", "other", h.origin]);
      await h.a.exec("git", ["config", "remote.other.arc-state", "off"]);
      await h.a.exec("git", ["config", "remote.pushDefault", "other"]);
    } else {
      expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
      await h.a.exec("git", ["remote", "add", "upstream", h.origin]);
      expect((await runStoreRemote(h.a.ports, { remote: "upstream", role: "push" })).status).toBe("ok");
      await h.a.exec("git", ["remote", "remove", "origin"]);
    }
    const to = await destination(h);
    const config = (await h.a.exec("git", ["config", "--list", "--local"])).stdout;
    const remoteBefore = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
    expect(await runStoreMigrate(h.a.ports, { to })).toMatchObject({ status: "refused",
      refusal: { code: "move-incomplete", remedy: { argv: ["arc", "store", "migrate"] } } });
    expect((await h.a.exec("git", ["config", "--list", "--local"])).stdout).toBe(config);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(remoteBefore);
    expect((await h.a.exec("git", ["--git-dir", to, "for-each-ref"])).stdout).toBe("");
    expect(await recordTip(h)).toBe("");
  });

  it.each([true, false])("refuses a remote move on an ambiguous designation as a role conflict, then moves once one push remains (trial: %s)", async (trial) => {
    const h = await layoutFixture();
    await h.a.exec("git", ["remote", "add", "other", h.origin]);
    await h.a.exec("git", ["config", "remote.other.arc-state", "push"]);
    const to = await destination(h);
    expect(await runStoreMigrate(h.a.ports, { to, trial })).toMatchObject({ status: "refused", refusal: { code: "role-conflict",
      condition: expect.stringMatching(/origin.*other/u), remedy: { text: expect.stringContaining("arc store remote <name> off") } } });
    expect((await h.a.exec("git", ["--git-dir", to, "for-each-ref"])).stdout).toBe("");
    expect(await recordTip(h)).toBe("");
    await h.a.exec("git", ["config", "remote.other.arc-state", "off"]);
    success(await h.a.store.push());
    expect((await runStoreMigrate(h.a.ports, { to, trial: true })).status).toBe("ok");
  });

  it("stops no-target reconciliation on an ambiguous designation without moving the store", async () => {
    const h = await layoutFixture();
    await h.a.exec("git", ["remote", "add", "other", h.origin]);
    await h.a.exec("git", ["config", "remote.other.arc-state", "push"]);
    expect(await runStoreMigrate(h.a.ports)).toMatchObject({ status: "refused", refusal: { code: "role-conflict",
      condition: expect.stringMatching(/origin.*other/u), remedy: { text: expect.stringContaining("arc store remote <name> off") } } });
    await expect(h.a.ports.fs.lstat(h.storeDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(success(await h.a.store.read({ reference: h.primary.reference })).content).toBe(makeMetaFixture("alpha"));
  });

  it("returns the recorded layout report from a rerun that resumes after the source delete", async () => {
    const h = await layoutFixture();
    await expect(runStoreRemote({ ...h.a.ports, migrateStep: (step) => step === "layout.deleted"
      ? Promise.reject(new Error("Stop after source delete")) : Promise.resolve() }, { remote: "origin", role: "off" })).rejects.toThrow("Stop after source delete");
    const rerun = await runStoreMigrate(h.a.ports);
    if (rerun.status === "designation-needed") throw new Error("Unexpected designation question");
    const resumed = report(rerun);
    expect(resumed.move).toBe("layout");
    expect(resumed.refs.map(({ ref }) => ref).sort()).toEqual(h.before.map((line) => line.split(" ")[0]).sort());
    expect(resumed.refs.every(({ action }) => action === "copy")).toBe(true);
  });
});

it("returns the report of a layout move a refused setting finished first", async () => {
  const h = await layoutFixture();
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  await h.a.exec("git", ["config", "remote.origin.arc-state", "push"]);
  await expect(runStoreMigrate({ ...h.a.ports, migrateStep: (step) => step === "layout.delete"
    ? Promise.reject(new Error("Stop after recorded switch")) : Promise.resolve() })).rejects.toThrow("Stop after recorded switch");
  await h.a.exec("git", ["remote", "add", "upstream", h.origin]);
  const result = await runStoreRemote(h.a.ports, { remote: "upstream", role: "push" });
  expect(result, JSON.stringify(result)).toMatchObject({ status: "ok", result: { layout: "default", report: { move: "layout",
    notices: expect.arrayContaining([expect.objectContaining({ condition: expect.stringContaining("upstream push was not applied"),
      remedy: expect.objectContaining({ argv: ["arc", "store", "migrate", "--to", "upstream"] }) })]) } } });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  await expect(h.a.exec("git", ["config", "remote.upstream.arc-state"])).rejects.toThrow();
});
