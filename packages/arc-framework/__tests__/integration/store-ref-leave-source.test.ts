/** Source departures use retained views and require a project identity at code receivers. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { deletedFollowSource } from "../helpers/store/leave-source.js";
import { followFixture } from "../helpers/store/follow.js";
import { switchFixture, personal, identity, provenance, createRemoteMover } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it("repairs competing publishers before retrying an unrecorded source departure", async () => {
  const h = await switchFixture("code", "upstream");
  await h.a.git(["push", h.destinationDirectory, "refs/arc/project/registry:refs/arc/project/registry"]);
  await h.a.exec("git", ["remote", "add", "backup", h.origin]);
  await h.a.exec("git", ["config", "remote.backup.arc-state", "push"]);
  expect(await invokeStoreMigrate(["--leave-source", "--to", h.to], h.ports))
    .toMatchObject({ status: "refused", refusal: { code: "role-conflict", class: "recoverable",
      condition: expect.stringContaining("each carry push"),
      remedy: { text: expect.stringContaining("arc store remote <name> off") } } });
  expect((await invokeStoreRemote(["backup", "off"], { cwd: h.a.root, ports: h.ports })).result.status).toBe("ok");
  const retried = await invokeStoreMigrate(["--leave-source", "--to", h.to], h.ports);
  expect(retried, JSON.stringify(retried)).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference: personal })).content).toBe("Shared state.\n");
  expect(success(await h.store.push()).states).toEqual([]);
}, 30_000);

it.each(["backing", "upstream"] as const)("leaves a deleted %s for a demonstrated code home after refusing an empty receiver", async source => {
  const h = await switchFixture(source, "code");
  if (source === "upstream") {
    await h.b.git(["remote", "remove", "backing"]);
    await h.b.exec("git", ["config", "remote.origin.arc-state", "off"]);
    await h.b.exec("git", ["remote", "add", "upstream", h.origin]);
    await h.b.exec("git", ["config", "remote.upstream.arc-state", "push"]);
  }
  success(await h.b.store.pull());
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  const config = join(h.b.root, ".arc", "system", "arc-config.yml"), pointer = "# Checkout with the new code-repository home.\n";
  await writeFile(config, pointer);
  const production = createStoreCommandPorts(h.b.root);
  const ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  const store = createRefStore(ports);
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  await rm(h.origin, { recursive: true, force: true });
  const empty = join(h.b.root, "empty-state.git");
  await h.b.exec("git", ["init", "--bare", empty]);
  await h.b.exec("git", ["remote", "set-url", "origin", empty]);
  const before = success(await store.version());
  const view = (await invokeStoreRemote(["--json"], { cwd: h.b.root, ports })).result;
  expect(await invokeStoreMigrate(["--leave-source", "--to", "origin"], ports)).toMatchObject({ status: "refused",
    refusal: { code: "request-invalid", condition: expect.stringContaining("arc store remote origin push") } });
  expect(success(await store.version())).toBe(before);
  expect((await invokeStoreRemote(["--json"], { cwd: h.b.root, ports })).result).toEqual(view);
  expect((await h.b.exec("git", [`--git-dir=${empty}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  const unidentified = await createRemoteMover(h, empty, "metadata-only-writer");
  await unidentified.exec("git", ["commit", "--allow-empty", "-m", "Initialize metadata-only writer"]);
  const created = success(await unidentified.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "unidentified-target" } }),
    content: makeMetaFixture("unidentified-target"), placement: { kind: "active" }, provenance }));
  const renamed = RecordReferenceSchema.parse({ ...created.reference, owner: { ...created.reference.owner, name: "unidentified-renamed" } });
  success(await unidentified.store.write({ action: "put", reference: renamed,
    expected: success(await unidentified.store.read({ reference: created.reference })).version,
    content: makeMetaFixture("unidentified-renamed"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  success(await unidentified.store.push());
  expect(await unidentified.store.read({ reference: identity })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const metadataOnly = (await h.b.exec("git", [`--git-dir=${empty}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  expect(metadataOnly).toContain("refs/arc/project/registry");
  expect(await invokeStoreMigrate(["--leave-source", "--to", "origin"], ports)).toMatchObject({ status: "refused",
    refusal: { code: "request-invalid", condition: expect.stringContaining("arc store remote origin push") } });
  expect(success(await store.version())).toBe(before);
  expect((await invokeStoreRemote(["--json"], { cwd: h.b.root, ports })).result).toEqual(view);
  expect((await h.b.exec("git", [`--git-dir=${empty}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(metadataOnly);
  await h.b.exec("git", ["remote", "set-url", "origin", h.destinationDirectory]);
  expect(await invokeStoreMigrate(["--leave-source", "--to", "origin"], ports)).toMatchObject({ status: "ok" });
  expect((await invokeStoreRemote(["--json"], { cwd: h.b.root, ports })).result).toMatchObject({ status: "ok", result: {
    layout: "default", remotes: expect.arrayContaining([expect.objectContaining({ name: "origin", role: "push", url: h.destinationDirectory })]),
  } });
  if (source === "upstream") expect((await h.b.exec("git", ["config", "remote.upstream.arc-state"])).stdout).toBe("off");
  expect(success(await store.read({ reference: personal })).content).toBe("Shared state.\n");
  expect(success(await store.pull()).states).toEqual([]);
  expect(await readFile(config, "utf8")).toBe(pointer);
}, 60_000);

it("refuses trial, the same URL, and a missing explicit destination without changing either receiver", async () => {
  const h = await switchFixture("backing", "backing");
  const before = success(await h.store.version());
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const target = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const roles = (await invokeStoreRemote(["--json"], { cwd: h.a.root, ports: h.ports })).result;
  for (const argv of [["--leave-source", "--trial", "--to", h.to], ["--leave-source", "--to", h.origin], ["--leave-source"]]) {
    const refused = await invokeStoreMigrate(argv, h.ports);
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "request-invalid" } });
    if (argv.includes("--trial")) expect(refused).toMatchObject({ refusal: { condition: expect.stringContaining("--trial") } });
    expect(success(await h.store.version())).toBe(before);
    expect((await invokeStoreRemote(["--json"], { cwd: h.a.root, ports: h.ports })).result).toEqual(roles);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(target);
  }
  await h.a.git(["remote", "remove", "backing"]);
  expect(await invokeStoreMigrate(["--leave-source", "--to", h.to], h.ports)).toMatchObject({ status: "refused", refusal: { code: "no-state-remote" } });
});

it.each(["code", "backing"] as const)("refuses a --to URL the checkout's pointer does not name, leaving a %s source untouched", async source => {
  const h = await switchFixture(source, "backing"), elsewhere = join(h.a.root, "elsewhere.git");
  await h.a.exec("git", ["init", "--bare", elsewhere]);
  const before = success(await h.store.version());
  const roles = (await invokeStoreRemote(["--json"], { cwd: h.a.root, ports: h.ports })).result;
  const held = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  expect(await invokeStoreMigrate(["--leave-source", "--to", elsewhere], h.ports)).toMatchObject({ status: "refused",
    refusal: { code: "request-invalid", condition: expect.stringContaining(elsewhere) } });
  expect(success(await h.store.version())).toBe(before);
  expect((await invokeStoreRemote(["--json"], { cwd: h.a.root, ports: h.ports })).result).toEqual(roles);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(held);
  expect((await h.a.exec("git", [`--git-dir=${elsewhere}`, "for-each-ref"])).stdout).toBe("");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
});

it("routes a deleted read source to off and refuses to treat it as this clone's publisher", async () => {
  const h = await deletedFollowSource(), follower = h.follower;
  await follower.exec("git", ["config", "remote.origin.arc-state", "read"]);
  const before = success(await follower.store.version());
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "unreachable", remedy: { text: expect.stringContaining("arc store remote origin off") },
  } } });
  expect(await invokeStoreMigrate(["--leave-source", "--to", h.destinationDirectory], follower.ports)).toMatchObject({ status: "refused",
    refusal: { code: "no-state-remote", remedy: { text: expect.stringContaining("arc store remote origin off") } } });
  expect(success(await follower.store.version())).toBe(before);
});

it("refuses a destination another move left, then leaves straight to the repaired pointer's home", async () => {
  const h = await followFixture(), follower = h.follower;
  const fork = join(h.a.root, "older-project-copy.git");
  await follower.exec("git", ["init", "--bare", fork]);
  await follower.git(["push", fork, "refs/arc/project/registry:refs/arc/project/registry"]);
  const older = (await follower.exec("git", [`--git-dir=${fork}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const mover = await createRemoteMover(h, h.destinationDirectory, "onward-source-mover");
  const onward = join(mover.root, "onward.git");
  await mover.exec("git", ["init", "--bare", onward]);
  expect((await invokeStoreMigrate(["--to", onward], mover.ports)).status).toBe("ok");
  await rm(h.origin, { recursive: true, force: true });
  const before = success(await follower.store.version());
  const roles = (await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result;
  const departed = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  expect(await invokeStoreMigrate(["--leave-source", "--to", h.destinationDirectory], follower.ports)).toMatchObject({ status: "refused",
    refusal: { code: "moved", remedy: { text: expect.stringContaining("--leave-source --to") } } });
  expect(success(await follower.store.version())).toBe(before);
  expect((await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result).toEqual(roles);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(departed);
  await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(fork)}\n`);
  expect(await invokeStoreMigrate(["--leave-source", "--to", fork], follower.ports)).toMatchObject({ status: "refused",
    refusal: { code: "moved", condition: expect.stringContaining("registry commit") } });
  expect(success(await follower.store.version())).toBe(before);
  expect((await follower.exec("git", [`--git-dir=${fork}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(older);
  await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(onward)}\n`);
  expect(await invokeStoreMigrate(["--leave-source", "--to", onward], follower.ports)).toMatchObject({ status: "ok" });
  success(await follower.store.push());
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect(success(await follower.store.pull()).states).toEqual([]);
});
