/** Follow copies apply lifecycle merging with the destination as the local side and preserve reopen intent. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { switchFixture, provenance, capturePeerState, landPreparedOldPush } from "../helpers/store/remote-move.js";
import { abandonRemoteWork } from "../helpers/store/remote-lifecycle.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

async function bindFollower(h: Awaited<ReturnType<typeof switchFixture>>) {
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  await writeFile(config, `storage.backing_repository: ${JSON.stringify(h.destinationDirectory)}\n`);
  const production = createStoreCommandPorts(h.b.root);
  const ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  return { ports, store: createRefStore(ports) };
}

it.each(["write", "archive", "abandon"] as const)("follows over the mover's abandonment and a late source %s", async mode => {
  const h = await switchFixture();
  const created = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended-during-follow" } }),
    content: makeMetaFixture("ended-during-follow"), placement: { kind: "active" }, provenance }));
  const companion = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: created.reference.owner, key: "initial.md" });
  success(await h.store.write({ action: "put", reference: companion, expected: null, content: "Before ending.\n", provenance }));
  success(await h.store.push()); success(await h.b.store.pull());
  const before = await capturePeerState(h);
  let publishedLineage = "", ownLineage = "";
  if (mode === "write") success(await h.b.store.write({ action: "put", reference: RecordReferenceSchema.parse({ ...companion, key: "late.md" }),
    expected: null, content: "Late follower write.\n", provenance }));

  const after = await capturePeerState(h), owner = created.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("No minted work item");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`), live = `refs/arc/work/${owner.uid}`;
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step !== "remote.switched") return;
    ownLineage = await abandonRemoteWork(h, h.store, created.reference, h.a, "mover-end");
    success(await h.store.push());
    if (mode !== "write") {
      await h.b.git(["fetch", "--refmap=", "--no-tags", "--", h.origin, "refs/arc/project/registry:refs/arc/project/registry"]);
      const beforeTerminal = await capturePeerState(h);
      if (mode === "archive") success(await h.b.store.write({ action: "put", reference: created.reference,
        expected: success(await h.b.store.read({ reference: created.reference })).version, content: makeMetaFixture("ended-during-follow"),
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
      else publishedLineage = await abandonRemoteWork(h, h.b.store, created.reference, h.b, "follower-end");
      await landPreparedOldPush(h, beforeTerminal, await capturePeerState(h));
    } else await landPreparedOldPush(h, before, after);
    throw new Error("Paused mover before cleanup");
  } })).rejects.toThrow("Paused mover before cleanup");
  expect(success(await h.b.store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved" }));
  const follower = await bindFollower(h);
  const followed = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.b.root, ports: follower.ports })).result;
  expect(followed.status, JSON.stringify(followed)).toBe("ok");
  if (mode !== "write") expect(followed).toMatchObject({ result: { report: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringMatching(/withdraw/iu) }),
  ]) } } });
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", live, history])).stdout.trim()).toBe(history);
  success(await follower.store.pull({ history: [history] }));
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner });
  if (mode === "write") {
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Late follower write.", history])).stdout).toContain("Late follower write.");
    expect(success(await follower.store.read({ reference: lineage })).content).toBe(ownLineage);
  } else if (mode === "archive") {
    expect(success(await follower.store.read({ reference: created.reference })).placement).toMatchObject({ kind: "completed", quarter: "2026-q4" });
    expect(await follower.store.read({ reference: lineage })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  } else expect(success(await follower.store.read({ reference: lineage })).content).toBe(publishedLineage);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
}, 60_000);

it.each(["mover", "follower"] as const)("keeps the %s's local reopen and deletes copied history at its next push", async side => {
  const h = await switchFixture();
  const created = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "reopened-before-switch" } }),
    content: makeMetaFixture("reopened-before-switch"), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance }));
  const owner = created.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("No minted work item");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${owner.uid}`), live = `refs/arc/work/${owner.uid}`;
  success(await h.store.push()); success(await h.b.store.pull({ history: [history] }));
  const reopening = side === "mover" ? h.store : h.b.store;
  success(await reopening.write({ action: "put", reference: created.reference, expected: success(await reopening.read({ reference: created.reference })).version,
    content: makeMetaFixture("reopened-before-switch"), placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  let publishing = h.store;
  if (side === "follower") {
    expect(success(await h.b.store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved" }));
    const follower = await bindFollower(h);
    expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.b.root, ports: follower.ports })).result.status).toBe("ok");
    publishing = follower.store;
  }
  success(await publishing.push());
  expect(success(await publishing.read({ reference: created.reference })).placement).toMatchObject({ kind: "active" });
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", live, history])).stdout.trim()).toBe(live);
}, 60_000);
