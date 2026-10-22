/** Licensed delete rounds leave the departed receiver with its forwarding record alone. */
import { expect, it } from "vitest";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { createKindRegistry, createRefStore, HistoryRefSchema, RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { switchFixture, directions, personal, provenance, capturePeerState, landPreparedOldPush, createRemoteMover } from "../helpers/store/remote-move.js";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { readOnlyGitEndpoint } from "../helpers/store/read-only-git-remote.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(directions)("finishes the move from $source to $destination with only its forwarding record left behind", async ({ source, destination }) => {
  const h = await switchFixture(source, destination);
  let forwardRegistry = "";
  const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") forwardRegistry = (await h.remote("git", ["rev-parse", "refs/arc/project/registry"])).stdout.trim();
  } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  expect(forwardRegistry).not.toBe("");
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "merge-base", "--is-ancestor", forwardRegistry, "refs/arc/project/registry"]);
  expect(success(await h.store.pull()).states).toEqual([]);
  expect(success(await h.store.push()).states).toEqual([]);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Pending local state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Pending local state.");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
}, 45_000);

it("keeps both receivers untouched until a follower restores the move, then re-copies unseen identity and history refs", async () => {
  const h = await switchFixture();
  success(await h.b.store.pull());
  const writer = await createRemoteMover(h, h.origin, "unseen-publisher");
  const beth = createRefStore({ ...writer.ports, identity: async () => SlugSchema.parse("beth") });
  const unseen = RecordReferenceSchema.parse({ ...personal, owner: { type: "person", name: "beth" }, key: "unseen.md" });
  success(await beth.write({ action: "put", reference: unseen, expected: null, content: "Beth's only published copy.\n", provenance }));
  success(await beth.push());
  const bethTip = (await h.remote("git", ["rev-parse", "refs/arc/user/beth/personal"])).stdout.trim();
  const ended = success(await writer.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "unseen-history" } }),
    content: makeMetaFixture("unseen-history"), placement: { kind: "active" }, provenance }));
  const current = success(await writer.store.read({ reference: ended.reference }));
  success(await writer.store.write({ action: "put", reference: ended.reference, expected: current.version,
    content: makeMetaFixture("unseen-history"), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await writer.store.push());
  const history = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/history/"])).stdout.trim();
  const [historyRef, historyTip] = history.split(" ");
  expect(historyRef).toMatch(/^refs\/arc\/history\/work\//u);

  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Paused after switch");
  } })).rejects.toThrow("Paused after switch");
  success(await h.store.pull());
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  await writeFile(config, `storage.backing_repository: ${JSON.stringify(h.destinationDirectory)}\n`);
  const production = createStoreCommandPorts(h.b.root);
  const followerPorts = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  const follower = createRefStore(followerPorts);
  success(await follower.pull());
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: h.b.root, ports: { ...followerPorts,
    migrateStep: async step => { if (step === "follow.switched") throw new Error("Paused follower before clear"); },
  } })).rejects.toThrow("Paused follower before clear");
  success(await follower.pull());
  const refs = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
  for (const ref of refs) await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "update-ref", "-d", ref]);
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const refused = await invokeStoreMigrate([], h.ports);
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", condition: expect.stringContaining("registry commit"), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
  expect(await invokeStoreMigrate([], followerPorts)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(success(await follower.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/user/beth/", "refs/arc/history/"])).stdout).toBe("");
  expect((await invokeStoreMigrate([], followerPorts)).status).toBe("ok");
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(objectname)", "refs/arc/user/beth/personal"])).stdout.trim()).toBe(bethTip);
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", "refs/arc/user/beth/"])).stdout).toBe("");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(objectname)", historyRef ?? "missing-history"])).stdout.trim()).toBe(historyTip);
  for (const side of [h.a, h.b]) expect((await side.git(["for-each-ref", "--format=%(refname)", "refs/arc/history/"])).stdout).toBe("");
  expect(success(await follower.pull()).states).toEqual([]);
}, 60_000);

it("re-copies a prepared teammate write, new item, and archive that land after the switch", async () => {
  const h = await switchFixture();
  const ending = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ending" } }),
    content: makeMetaFixture("ending"), placement: { kind: "active" }, provenance }));
  success(await h.store.push()); success(await h.b.store.pull());
  const before = await capturePeerState(h);
  success(await h.b.store.write({ action: "put", reference: personal, expected: success(await h.b.store.read({ reference: personal })).version,
    content: "Teammate after copy.\n", provenance }));
  const created = success(await h.b.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "late-item" } }),
    content: makeMetaFixture("late-item"), placement: { kind: "active" }, provenance }));
  success(await h.b.store.write({ action: "put", reference: ending.reference, expected: success(await h.b.store.read({ reference: ending.reference })).version,
    content: makeMetaFixture("ending"), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const after = await capturePeerState(h);
  const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") await landPreparedOldPush(h, before, after);
  } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  success(await h.store.pull());
  expect(success(await h.store.read({ reference: personal })).content).toBe("Teammate after copy.\n");
  expect(success(await h.store.read({ reference: created.reference })).content).toBe(makeMetaFixture("late-item"));
  expect(success(await h.store.read({ reference: ending.reference })).placement).toMatchObject({ kind: "completed", quarter: "2026-q4" });
}, 45_000);

it("retries a delete lease lost to a prepared late push and carries that write in its next round", async () => {
  const h = await switchFixture(); success(await h.b.store.pull());
  const before = await capturePeerState(h);
  success(await h.b.store.write({ action: "put", reference: personal, expected: success(await h.b.store.read({ reference: personal })).version,
    content: "Won the delete lease.\n", provenance }));
  const after = await capturePeerState(h);
  let rounds = 0;
  const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.delete" && ++rounds === 1) await landPreparedOldPush(h, before, after);
  } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  success(await h.store.pull());
  expect(success(await h.store.read({ reference: personal })).content).toBe("Won the delete lease.\n");
  expect(rounds).toBe(2);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 45_000);

it.each(["listing", "delete"] as const)("retains a failed %s round and completes after native receiver repair", async fault => {
  const h = await switchFixture(), offline = join(h.a.root, "offline-source.git"), hook = join(h.origin, "hooks", "pre-receive");
  let armed = true, source = "";
  const ports = { ...h.ports, migrateStep: async (step: string) => {
    if (step !== "remote.switched" || !armed) return;
    armed = false;
    source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    if (fault === "listing") await rename(h.origin, offline);
    else {
      await writeFile(hook, '#!/bin/sh\nwhile read old new ref; do\n  case "$new" in *[!0]*) ;; *) echo "Delete blocked by fixture" >&2; exit 1 ;; esac\ndone\n');
      await chmod(hook, 0o755);
    }
  } };
  let result;
  try { result = await invokeStoreMigrate(["--to", h.to], ports); }
  finally { if (!armed) { if (fault === "listing") await rename(offline, h.origin); else await rm(hook, { force: true }); } }
  expect(result).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", condition: expect.stringContaining(fault === "listing" ? h.origin : "Delete blocked by fixture"), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect(success(await h.store.pull()).states).toEqual([]);
}, 45_000);

it("deletes through the recorded push URL after switching away from an upload-only fetch endpoint", async () => {
  const h = await switchFixture();
  const fetchUrl = await readOnlyGitEndpoint(h.origin);
  await h.a.exec("git", ["remote", "set-url", "origin", fetchUrl]);
  await h.a.exec("git", ["remote", "set-url", "--push", "origin", h.origin]);
  let recorded: unknown;
  const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") recorded = JSON.parse((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout);
  } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect(recorded).toMatchObject({ source: { fetchUrl, pushUrl: h.origin } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  expect(success(await h.store.pull()).states).toEqual([]);
}, 45_000);

it.each([
  "remote.fetch-source", "remote.fetch-destination", "remote.build", "remote.record", "remote.copy", "remote.copied",
  "remote.forward", "remote.forwarded", "remote.pointer", "remote.switch", "layout.build", "layout.record", "layout.rename",
  "layout.designation", "layout.delete", "remote.switched", "remote.read-destination", "remote.list-source", "remote.recopy",
  "remote.recopied", "remote.delete", "remote.deleted", "remote.finish",
])("restarts a complete move interrupted at %s", async boundary => {
  const h = await switchFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === boundary) throw new Error(`Interrupted ${boundary}`);
  } })).rejects.toThrow(`Interrupted ${boundary}`);
  const landed = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(objectname)", "refs/arc/project/registry"])).stdout.trim();
  const moved = await invokeStoreMigrate(["--to", h.to], h.ports);
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  if (landed) await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "merge-base", "--is-ancestor", landed, "refs/arc/project/registry"]);
  expect(success(await h.store.pull()).states).toEqual([]);
  expect(success(await h.store.push()).states).toEqual([]);
}, 45_000);

it("finishes a recorded remote move before applying a setting and retains the completed move report", async () => {
  const h = await switchFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Paused after switch");
  } })).rejects.toThrow("Paused after switch");
  const applied = (await invokeStoreRemote(["origin", "off", "--json"], { cwd: h.a.root, ports: h.ports })).result;
  expect(applied.status, JSON.stringify(applied)).toBe("ok");
  if (applied.status !== "ok") throw new Error("The setting refused");
  expect(applied.result.report?.notices).toContainEqual(expect.objectContaining({ condition: expect.stringMatching(/Teammates follow.*pointer.*code/u) }));
  expect(applied.result.report?.refs).toContainEqual(expect.objectContaining({ ref: "refs/arc/project/registry", action: "delete" }));
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect(success(await h.store.pull()).states).toEqual([]);
}, 45_000);

it("keeps a destination reopen live rather than copying the old history namespace back", async () => {
  const h = await switchFixture();
  const created = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "reopened" } }),
    content: makeMetaFixture("reopened"), placement: { kind: "active" }, provenance }));
  success(await h.store.write({ action: "put", reference: created.reference, expected: success(await h.store.read({ reference: created.reference })).version,
    content: makeMetaFixture("reopened"), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.store.push());
  const owner = created.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("No minted work item");
  const live = `refs/arc/work/${owner.uid}`, history = HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`);
  const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step !== "remote.switched") return;
    success(await h.store.pull({ history: [history] }));
    success(await h.store.write({ action: "put", reference: created.reference, expected: success(await h.store.read({ reference: created.reference })).version,
      content: makeMetaFixture("reopened"), placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    success(await h.store.push());
  } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", live, history])).stdout.trim()).toBe(live);
  success(await h.store.pull());
  expect(success(await h.store.read({ reference: created.reference })).placement).toEqual({ kind: "active" });
}, 45_000);

it("merges a re-copy onto a changed destination, retries its lease, and preserves advisory notices", async () => {
  const h = await switchFixture(); success(await h.b.store.pull());
  const source = RecordReferenceSchema.parse({ ...personal, key: "source.md" });
  const destination = RecordReferenceSchema.parse({ ...personal, key: "destination.md" });
  const raced = RecordReferenceSchema.parse({ ...personal, key: "raced.md" });
  const before = await capturePeerState(h);
  success(await h.b.store.write({ action: "put", reference: source, expected: null, content: "Source re-copy.\n", provenance }));
  const after = await capturePeerState(h), registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const check: WriteCheck = async ({ reference, next, before, after }) => {
    if (reference.key !== source.key || next?.content !== "Source re-copy.\n") return [];
    expect(success(await before.read({ reference: destination })).content).toBe("Destination since copy.\n");
    expect(success(await after.read({ reference: source })).content).toBe("Source re-copy.\n");
    expect(success(await after.read({ reference: destination })).content).toBe("Destination since copy.\n");
    return ["copy.one", "copy.two"].map(rule => ({ rule, condition: "The combined state needs correction.", remedy: { text: "Review the combined state." } }));
  };
  let race = true;
  const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports,
    registry: { ...registry, "personal/document": { ...registry["personal/document"], check } }, migrateStep: async step => {
      if (step === "remote.switched") {
        await landPreparedOldPush(h, before, after);
        success(await h.store.write({ action: "put", reference: destination, expected: null, content: "Destination since copy.\n", provenance }));
        success(await h.store.push());
      }
      if (step === "remote.recopy" && race) {
        race = false;
        success(await h.store.write({ action: "put", reference: raced, expected: null, content: "Raced the re-copy.\n", provenance }));
        success(await h.store.push());
      }
    } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  if (moved.status !== "ok") throw new Error("The re-copy refused");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  success(await h.store.pull());
  for (const [reference, content] of [[source, "Source re-copy.\n"], [destination, "Destination since copy.\n"], [raced, "Raced the re-copy.\n"]] as const)
    expect(success(await h.store.read({ reference })).content).toBe(content);
  for (const rule of ["copy.one", "copy.two"]) expect(moved.result.notices).toContainEqual({ condition: expect.stringContaining(rule), remedy: { text: "Review the combined state." } });
}, 45_000);

it("keeps the mover's end published after source acquisition when it syncs before the delete round", async () => {
  const h = await switchFixture();
  const created = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended-after-fetch" } }),
    content: makeMetaFixture("ended-after-fetch"), placement: { kind: "active" }, provenance }));
  success(await h.store.push());
  const owner = created.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("No minted work item");
  const live = `refs/arc/work/${owner.uid}`, history = `refs/arc/history/work/${owner.uid}`;
  const trackingRoot = "refs/arc-remotes/origin/";
  const initialTracking = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", trackingRoot])).stdout.trim().split("\n").filter(Boolean).map(row => row.slice(trackingRoot.length));
  let ended = false;
  const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.build" && !ended) {
      ended = true;
      success(await h.store.write({ action: "put", reference: created.reference, expected: success(await h.store.read({ reference: created.reference })).version,
        content: makeMetaFixture("ended-after-fetch"), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
      success(await h.store.push());
    }
    if (step === "remote.switched") {
      expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", live, history])).stdout.trim()).toBe(live);
      const switchedRoot = "refs/arc-remotes/backing/";
      expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", switchedRoot])).stdout.trim().split("\n").filter(Boolean).map(row => row.slice(switchedRoot.length))).toEqual(initialTracking);
      success(await h.store.pull());
      expect(success(await h.store.read({ reference: created.reference })).placement).toMatchObject({ kind: "completed", quarter: "2026-q4" });
    }
  } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", live, history])).stdout.trim()).toBe(history);
  success(await h.store.pull());
  expect(success(await h.store.read({ reference: created.reference })).placement).toMatchObject({ kind: "completed", quarter: "2026-q4" });
}, 45_000);

it("retains the source when corrupt metadata prevents a complete re-copy and resumes after forward repair", async () => {
  const h = await switchFixture(), ref = "refs/arc/user/andrew/personal";
  const good = (await h.remote("git", ["ls-tree", "-r", ref])).stdout.trim().split("\n").map(row => {
    const [header, path] = row.split("\t"), [mode, type, oid] = (header ?? "").split(" ");
    if (mode !== "100644" || type !== "blob" || !oid || !path) throw new Error("Unexpected stored file entry");
    return { path, oid, mode } satisfies PlantTreeEntry;
  });
  let broken = "", destination = "";
  const refused = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step !== "remote.switched") return;
    success(await h.store.push());
    expect(good.filter(entry => /(^|\/)metadata-/u.test(entry.path))).toHaveLength(1);
    const entries: PlantTreeEntry[] = good.map(entry => /(^|\/)metadata-/u.test(entry.path) ? { path: entry.path, content: "not metadata JSON" } : entry);
    entries.push({ path: "andrew/unique-source.md.andrew", content: "Only the damaged source holds this write.\n" });
    broken = (await plantRef(h.origin, ref, entries, { parents: [h.sourcePersonal], gitDir: h.origin })).tip;
    destination = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  } });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", condition: expect.stringMatching(/metadata/iu), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(objectname)", ref])).stdout.trim()).toBe(broken);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destination);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
  await plantRef(h.origin, ref, good, { parents: [broken], gitDir: h.origin });
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "merge-base", "--is-ancestor", broken, ref]);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
}, 45_000);

it("cleans a pre-existing project destination in one accepted atomic source deletion", async () => {
  const h = await switchFixture(); success(await h.b.store.pull());
  const other = RecordReferenceSchema.parse({ ...personal, key: "destination-only.md" });
  success(await h.b.store.write({ action: "put", reference: other, expected: null, content: "Already at the destination.\n", provenance }));
  const state = await capturePeerState(h);
  await h.b.exec("git", ["push", "--atomic", "--", h.destinationDirectory, ...[...state].map(([ref, tip]) => `${tip}:${ref}`)]);
  const hook = join(h.origin, "hooks", "post-receive");
  await writeFile(hook, "#!/bin/sh\nprintf 'begin\\n' >> migration-receipts\ncat >> migration-receipts\n"); await chmod(hook, 0o755);
  const moved = await invokeStoreMigrate(["--to", h.to], h.ports);
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  success(await h.store.pull());
  expect(success(await h.store.read({ reference: other })).content).toBe("Already at the destination.\n");
  const batches = (await readFile(join(h.origin, "migration-receipts"), "utf8")).split("begin\n").filter(Boolean).map(batch => batch.trim().split("\n").map(row => row.split(" ")));
  const deletions = batches.filter(batch => batch.some(row => /^0+$/u.test(row[1] ?? "")));
  expect(deletions).toHaveLength(1);
  expect(deletions[0]?.map(row => row[2]).sort()).toEqual(["refs/arc/project/registry", "refs/arc/user/andrew/personal"]);
  expect(deletions[0]?.every(row => /^0+$/u.test(row[1] ?? ""))).toBe(true);
}, 45_000);

it("resumes its own forwarding with the original copied heads before re-copying a late source push", async () => {
  const h = await switchFixture(); success(await h.b.store.pull());
  const before = await capturePeerState(h);
  success(await h.b.store.write({ action: "put", reference: personal, expected: success(await h.b.store.read({ reference: personal })).version,
    content: "Landed while the mover was interrupted.\n", provenance }));
  const after = await capturePeerState(h);
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.forwarded") throw new Error("Interrupted before switch");
  } })).rejects.toThrow("Interrupted before switch");
  await landPreparedOldPush(h, before, after);
  const moved = await invokeStoreMigrate([], { ...h.ports, migrateStep: async step => {
    if (step !== "remote.switched") return;
    expect((await h.a.git(["rev-parse", "refs/arc-remotes/backing/user/andrew/personal"])).stdout.trim()).toBe(h.sourcePersonal);
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", "refs/arc/user/andrew/personal"])).stdout.trim()).toBe(h.sourcePersonal);
  } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  success(await h.store.pull());
  expect(success(await h.store.read({ reference: personal })).content).toBe("Landed while the mover was interrupted.\n");
}, 45_000);
