/** Backing repoints preserve lifecycle delete bases and honor the invoking checkout's pointer. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { createRefStore, RecordReferenceSchema, HistoryRefSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { switchFixture, provenance } from "../helpers/store/remote-move.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("carries a reopen's owed history delete when repointing away from a deleted backing", async () => {
  const h = await switchFixture("backing", "backing");
  const made = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "repoint-reopen" } }),
    content: makeMetaFixture("repoint-reopen"), placement: { kind: "active" }, provenance }));
  const read = success(await h.store.read({ reference: made.reference }));
  success(await h.store.write({ action: "put", reference: made.reference, expected: read.version, content: read.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.store.push());
  const owner = made.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a minted work item");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`);
  success(await h.b.store.pull({ history: [history] }));
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  const archived = success(await h.b.store.read({ reference: made.reference }));
  success(await h.b.store.write({ action: "put", reference: made.reference, expected: archived.version, content: archived.content,
    placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  await writeFile(config, `storage.backing_repository: ${JSON.stringify(h.destinationDirectory)}\n`);
  const production = createStoreCommandPorts(h.b.root), ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  const follower = createRefStore(ports);
  await rm(h.origin, { recursive: true, force: true });
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.b.root, ports })).result.status).toBe("ok");
  expect(success(await follower.push()).states).toEqual([]);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", history])).stdout).toBe("");
  expect(success(await follower.read({ reference: made.reference })).placement).toEqual({ kind: "active" });
}, 60_000);

it("sets push after a read follow without a pre-copy and refuses a stale checkout's backing pointer", async () => {
  const h = await followFixture(undefined, "backing"), follower = h.follower;
  expect((await invokeStoreRemote(["backing", "read", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const destination = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destination);
  await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(h.origin)}\n`);
  const refused = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "moved", remedy: {
    text: expect.stringContaining("arc store migrate --to"),
  } } });
  expect((await follower.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.destinationDirectory);
  await writeFile(follower.config, follower.pointer);
  expect(success(await follower.store.push()).states).toEqual([]);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it("lets a local-only clone follow after a moved publisher is added as a read source", async () => {
  const h = await followFixture(), follower = h.follower;
  expect((await invokeStoreRemote(["origin", "off", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  const refused = (await invokeStoreRemote(["origin", "push", "--own-state", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "moved" } });
  expect((await invokeStoreRemote(["origin", "read", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  success(await follower.store.pull());
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  expect((await invokeStoreRemote(["backing", "read", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  expect(success(await follower.store.pull()).states).toEqual([{ status: "no-remote" }]);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it("names backing off then code push when the lost backing's state never reached that code remote", async () => {
  const h = await switchFixture("backing", "code");
  await rm(h.origin, { recursive: true, force: true });
  for (const refused of [
    (await invokeStoreRemote(["origin", "push", "--json"], { cwd: h.a.root, ports: h.ports })).result,
    await invokeStoreMigrate(["--leave-source", "--to", "origin"], h.ports),
  ]) {
    expect(refused).toMatchObject({ status: "refused", refusal: { remedy: { text: expect.stringContaining("arc store remote backing off") } } });
    expect(refused).toMatchObject({ status: "refused", refusal: { remedy: { text: expect.stringContaining("arc store remote origin push") } } });
  }
  expect((await invokeStoreRemote(["backing", "off", "--json"], { cwd: h.a.root, ports: h.ports })).result.status).toBe("ok");
  expect((await invokeStoreRemote(["origin", "push", "--own-state", "--json"], { cwd: h.a.root, ports: h.ports })).result.status).toBe("ok");
  expect(success(await h.store.push()).states).toEqual([]);
}, 60_000);
