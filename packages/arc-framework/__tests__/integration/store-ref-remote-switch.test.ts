/** Forwarding precedes clone switches across code remotes and backing repositories. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { switchFixture, directions, projectId, personal, provenance } from "../helpers/store/remote-move.js";
import { readOnlyGitEndpoint } from "../helpers/store/read-only-git-remote.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";

it.each(directions)("forwards before switching from $source to $destination and syncs only with the new remote", async ({ source, destination }) => {
  const h = await switchFixture(source, destination);
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Paused after remote switch");
  } })).rejects.toThrow("Paused after remote switch");
  const forwarded = JSON.parse((await h.remote("git", ["show", "refs/arc/project/moved:moved.json"])).stdout);
  const recorded = JSON.parse((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout);
  expect(recorded).toMatchObject({ kind: "remote", source: { name: h.sourceName, fetchUrl: h.origin }, destination: { name: h.destinationName, fetchUrl: h.destinationDirectory } });
  expect(forwarded).toEqual({ projectId, registryCommit: recorded.registryCommit });
  expect((await h.remote("git", ["rev-list", "--parents", "-1", "refs/arc/project/moved"])).stdout.trim().split(" ")).toHaveLength(1);
  expect((await h.remote("git", ["ls-tree", "--name-only", "refs/arc/project/moved"])).stdout.trim()).toBe("moved.json");
  expect((await h.remote("git", ["log", "-1", "--format=%B", "refs/arc/project/registry"])).stdout).toContain("Arc-Lifecycle-Action: forward");
  expect((await h.remote("git", ["log", "-1", "--format=%B", "refs/arc/project/registry"])).stdout).toContain(`Arc-Owner: ${projectId}`);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", "refs/arc/project/registry"])).stdout.trim()).toBe(recorded.registryCommit);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", "refs/arc/project/registry^{tree}"])).stdout.trim()).toBe(h.sourceRegistryTree);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "log", "-1", "--format=%B", "refs/arc/project/registry"])).stdout).toContain(`Arc-Owner: ${projectId}`);
  const roots = [`refs/arc-remotes/${h.destinationName}/`, `refs/arc/tmp/seen/${h.destinationName}/`];
  for (const [index, root] of roots.entries()) {
    const rows = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", root])).stdout.trim().split("\n").filter(Boolean).map(row => row.slice(root.length)).sort();
    expect(rows).toEqual(h.heads[index]);
  }
  const designated = destination === "backing" ? await h.a.git(["config", "remote.backing.arc-state"])
    : await h.a.exec("git", ["config", `remote.${h.destinationName}.arc-state`]);
  expect(designated.stdout.trim()).toBe("push");
  if (source !== "backing" || destination !== "backing") {
    const roles = (await h.a.exec("git", ["config", "--null", "--list", "--local"])).stdout;
    if (source !== "backing") expect(roles).toContain(`remote.${h.sourceName}.arc-state\noff`);
    if (destination !== "backing") expect((await h.a.git(["remote"])).stdout.split("\n")).not.toContain("backing");
  }
  const pointer = await readFile(h.config, "utf8");
  expect(pointer).toContain('# Keep this comment.\nhistory.policy: "rewrite-with-lease"\n');
  expect(pointer).toContain(`storage.backing_repository: ${JSON.stringify(destination === "backing" ? h.destinationDirectory : "")}`);
  expect(success(await h.store.pull()).states).toContainEqual(expect.objectContaining({ status: "move-unfinished" }));
  expect(success(await h.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  expect((await h.remote("git", ["rev-parse", "refs/arc/user/andrew/personal"])).stdout.trim()).toBe(h.sourcePersonal);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Pending local state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Pending local state.");
}, 45_000);


it("carries a genuinely pruned history head through a layout-changing switch", async () => {
  const h = await switchFixture();
  const created = success(await h.store.write({ action: "put", reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended" } }),
    expected: null, content: makeMetaFixture("ended"), placement: { kind: "active" }, provenance }));
  expect(success(await h.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  success(await h.b.store.pull());
  success(await h.b.store.write({ action: "put", reference: created.reference, expected: success(await h.b.store.read({ reference: created.reference })).version,
    content: makeMetaFixture("ended"), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  expect(success(await h.b.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  success(await h.store.pull());
  const uid = "uid" in created.reference.owner ? created.reference.owner.uid : "";
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${uid}`);
  success(await h.b.store.write({ action: "put", reference: created.reference, expected: success(await h.b.store.read({ reference: created.reference })).version,
    content: makeMetaFixture("ended"), placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  expect(success(await h.b.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  success(await h.store.pull({ history: [history] }));
  const kept = (await h.a.git(["for-each-ref", "--format=%(objectname)", `refs/arc/tmp/seen/origin/history/work/${uid}`])).stdout.trim();
  expect(kept).toMatch(/^[0-9a-f]{40}$/u);
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Paused after remote switch");
  } })).rejects.toThrow("Paused after remote switch");
  expect((await h.a.git(["for-each-ref", "--format=%(objectname)", `refs/arc/tmp/seen/backing/history/work/${uid}`])).stdout.trim()).toBe(kept);
  expect(success(await h.store.read({ reference: created.reference })).placement).toMatchObject({ kind: "active" });
}, 45_000);

it("resumes after forwarding without another forwarding push or copy", async () => {
  const h = await switchFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.forwarded") throw new Error("Paused after forwarding");
  } })).rejects.toThrow("Paused after forwarding");
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const copied = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  await expect(invokeStoreMigrate([], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Paused after remote switch");
  } })).rejects.toThrow("Paused after remote switch");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(copied);
  expect((await h.a.git(["config", "remote.backing.url"])).stdout.trim()).toBe(h.destinationDirectory);
}, 45_000);

it("keeps its forwarded move after a pointer-write refusal and finishes once the file is repaired", async () => {
  const h = await switchFixture(), original = await readFile(h.config, "utf8");
  await rm(h.config); await mkdir(h.config);
  const refused = await invokeStoreMigrate(["--to", h.to], h.ports);
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", condition: expect.stringContaining("pointer"), remedy: { text: expect.stringContaining("arc-config.yml") } } });
  const forwarded = (await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim();
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
  await rm(h.config, { recursive: true }); await writeFile(h.config, original);
  const repaired = await invokeStoreMigrate([], h.ports);
  expect(repaired.status, JSON.stringify(repaired)).toBe("ok");
  if (repaired.status !== "ok") throw new Error("Pointer repair refused");
  expect(repaired.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringMatching(/Teammates follow.*pointer.*code/u) }));
  expect((await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim()).toBe(forwarded);
  expect((await h.a.git(["config", "remote.backing.url"])).stdout.trim()).toBe(h.destinationDirectory);
}, 45_000);

it("keeps a second worktree's move out while the first retains its copied heads", async () => {
  const h = await switchFixture(), sibling = join(h.a.root, "sibling");
  await h.a.exec("git", ["worktree", "add", "--detach", sibling, "HEAD"]);
  let announce: () => void = () => {}, resume: () => void = () => {};
  const paused = new Promise<void>(resolve => { announce = resolve; });
  const continued = new Promise<void>(resolve => { resume = resolve; });
  const first = invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.copy") { announce(); await continued; }
  } });
  first.catch(() => {});
  try {
    await Promise.race([paused, first.then(() => { throw new Error("The move ended before its copy boundary"); })]);
    const before = (await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/tmp/migrate/"])).stdout;
    const other = createStoreCommandPorts(sibling);
    const refused = await invokeStoreMigrate(["--to", h.to], { ...other, lock: (name, wait) => other.lock(name, name === "migrate" ? 40 : wait) });
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "lock-held", class: "recoverable" } } });
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/tmp/migrate/"])).stdout).toBe(before);
  } finally { resume(); }
  const finished = await first;
  expect(finished.status, JSON.stringify(finished)).toBe("ok");
  if (finished.status !== "ok") throw new Error("The first move refused");
  expect(finished.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringMatching(/Teammates follow.*pointer.*code/u) }));
  expect((await h.a.git(["rev-parse", "refs/arc-remotes/backing/user/andrew/personal"])).stdout.trim()).toBe(h.sourcePersonal);
  expect((await h.a.git(["config", "remote.backing.url"])).stdout.trim()).toBe(h.destinationDirectory);
}, 45_000);

it("restarts a second worktree's already-pulled push against the switched remote", async () => {
  const h = await switchFixture(), sibling = join(h.a.root, "sync-sibling");
  await h.a.exec("git", ["worktree", "add", "--detach", sibling, "HEAD"]);
  success(await h.b.store.pull());
  const incoming = RecordReferenceSchema.parse({ ...personal, key: "incoming.md" });
  success(await h.b.store.write({ action: "put", reference: incoming, expected: null, content: "Incoming before the switch.\n", provenance }));
  expect(success(await h.b.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  const old = (await h.remote("git", ["rev-parse", "refs/arc/user/andrew/personal"])).stdout.trim();
  const native = createStoreCommandPorts(sibling);
  let fetched = false, merged = false, held = false, stopped = false, announce: () => void = () => {}, resume: () => void = () => {};
  const paused = new Promise<void>(resolve => { announce = resolve; });
  const continued = new Promise<void>(resolve => { resume = resolve; });
  const syncing = createRefStore({ ...native, exec: async (command, args, options) => {
    const result = await native.exec(command, args, options);
    if (args.includes("fetch")) fetched = true;
    if (merged && held && !stopped && args.includes("for-each-ref") && args.at(-1) === "refs/arc/") {
      stopped = true; announce(); await continued;
    }
    return result;
  }, lock: async (name, wait) => {
    const release = await native.lock(name, wait);
    if (name === "refs/arc/user/andrew/personal") held = true;
    return async () => {
      await release();
      if (name === "layout" && fetched) merged = true;
      if (name === "refs/arc/user/andrew/personal") held = false;
    };
  } }).push();
  syncing.catch(() => {});
  try {
    await Promise.race([paused, syncing.then(() => { throw new Error("The push ended before its captured listing"); })]);
    expect(success(await h.store.read({ reference: incoming })).content).toBe("Incoming before the switch.\n");
    await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
      if (step === "remote.switched") throw new Error("Paused before remote cleanup");
    } })).rejects.toThrow("Paused before remote cleanup");
  } finally { resume(); }
  const pushed = success(await syncing);
  expect(pushed.publishes).toContainEqual(expect.objectContaining({ status: "reconciled", families: expect.arrayContaining(["personal"]) }));
  expect((await h.remote("git", ["rev-parse", "refs/arc/user/andrew/personal"])).stdout.trim()).toBe(old);
  for (const content of ["Pending local state.", "Incoming before the switch."]) {
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", content, "refs/arc/user/andrew/personal"])).stdout).toContain(content);
  }
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
}, 45_000);

it("uses the native push URL when the fetch endpoint refuses publication", async () => {
  const h = await switchFixture(), readOnly = await readOnlyGitEndpoint(h.origin);
  await h.a.exec("git", ["remote", "set-url", "origin", readOnly]);
  await h.a.exec("git", ["remote", "set-url", "--push", "origin", h.origin]);
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Paused after remote switch");
  } })).rejects.toThrow("Paused after remote switch");
  const recorded = JSON.parse((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout);
  expect(recorded.source).toMatchObject({ fetchUrl: readOnly, pushUrl: h.origin });
  expect(JSON.parse((await h.remote("git", ["show", "refs/arc/project/moved:moved.json"])).stdout)).toEqual({ projectId, registryCommit: recorded.registryCommit });
  expect((await h.a.git(["config", "remote.backing.url"])).stdout.trim()).toBe(h.destinationDirectory);
}, 45_000);

it("restarts a lost forwarding lease from a fresh source snapshot", async () => {
  const h = await switchFixture();
  success(await h.b.store.pull());
  const counter = RecordReferenceSchema.parse({ kind: "project-registry/counter", key: "during-copy", owner: { type: "project", name: "project" } });
  let first: string | undefined;
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.forward" && first === undefined) {
      first = JSON.parse((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout).registryCommit;
      success(await h.b.store.write({ action: "put", reference: counter, expected: null, content: '{"next":3}', provenance }));
      expect(success(await h.b.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
    }
    if (step === "remote.switched") throw new Error("Paused after remote switch");
  } })).rejects.toThrow("Paused after remote switch");
  const recorded = JSON.parse((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout);
  expect(first).toMatch(/^[0-9a-f]{40}$/u); expect(recorded.registryCommit).not.toBe(first);
  expect(JSON.parse((await h.remote("git", ["show", "refs/arc/project/moved:moved.json"])).stdout)).toEqual({ projectId, registryCommit: recorded.registryCommit });
  await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "merge-base", "--is-ancestor", first ?? "", recorded.registryCommit]);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", '"next":3', "refs/arc/project/registry"])).stdout).toContain('"next":3');
}, 45_000);

it("keeps newer comparison heads when an already-switched move resumes", async () => {
  const h = await switchFixture("backing", "backing");
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Paused after remote switch");
  } })).rejects.toThrow("Paused after remote switch");
  expect(success(await h.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  const before = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-remotes/backing/", "refs/arc/tmp/seen/backing/"])).stdout;
  expect((await h.a.git(["rev-parse", "refs/arc-remotes/backing/user/andrew/personal"])).stdout.trim()).not.toBe(h.sourcePersonal);
  const resumed = await invokeStoreMigrate([], h.ports);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-remotes/backing/", "refs/arc/tmp/seen/backing/"])).stdout).toBe(before);
}, 45_000);
