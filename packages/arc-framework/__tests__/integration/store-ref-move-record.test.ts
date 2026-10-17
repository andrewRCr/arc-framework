/** Clone-wide move exclusion and leased control records through the public entries. */

import { join } from "node:path";
import { plantRef } from "../helpers/store/ref-plant.js";
import { expect, it } from "vitest";
import { createRefSyncCheckout, refSyncFixture } from "../helpers/store/ref-sync.js";
import { runStoreMigrate, runStoreRemote, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { success } from "../helpers/store/suite-tools.js";

const moveRef = "refs/arc/tmp/migrate/move";
const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "preserved.md" });
const provenance = { verb: "user", lifecycleAction: "save" };

async function moveFixture() {
  const h = await refSyncFixture();
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Preserve this state.\n", provenance }));
  return h;
}

it("refuses a second worktree's mover at the migrate lock before any build", async () => {
  const h = await moveFixture();
  const linked = join(h.a.root, "linked-mover");
  await h.a.exec("git", ["worktree", "add", "-b", "competing-mover", linked]);
  const second = await createRefSyncCheckout(linked, "default", h.origin);
  let announce: () => void = () => {}, resume: () => void = () => {};
  const paused = new Promise<void>((resolve) => { announce = resolve; });
  const continued = new Promise<void>((resolve) => { resume = resolve; });
  const first = runStoreRemote({ ...h.a.ports, migrateStep: async (step) => { if (step === "layout.build") { announce(); await continued; } } }, { remote: "origin", role: "off" });
  try {
    await Promise.race([paused, first.then(() => { throw new Error("First move ended before its build"); })]);
    const refused = await runStoreMigrate({ ...second.ports, lock: (name) => second.ports.lock(name, 1) });
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "lock-held", class: "recoverable", lock: expect.stringContaining("migrate.lock") } } });
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
    await expect(h.a.ports.fs.lstat(join(h.a.root, ".git", "arc", "store-migrate-build"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(success(await h.a.store.read({ reference })).content).toBe("Preserve this state.\n");
  } finally { resume(); await first; }
  expect((await runStoreMigrate(second.ports)).status).toBe("ok");
  expect(success(await second.store.read({ reference })).content).toBe("Preserve this state.\n");
}, 30_000);

it.each(["create", "replace", "remove"] as const)("never overwrites or deletes a different record after it was captured: %s", async (phase) => {
  const h = await moveFixture();
  // Obtain the competing control record from the actual no-target producer.
  await h.b.exec("git", ["config", "remote.origin.arc-state", "off"]);
  await expect(runStoreMigrate({ ...h.b.ports, migrateStep: async (step) => { if (step === "layout.delete") throw new Error("Keep the producer's record"); } })).rejects.toThrow("Keep the producer's record");
  const competing = (await h.b.exec("git", ["rev-parse", moveRef])).stdout;
  await h.a.exec("git", ["fetch", "--no-write-fetch-head", h.b.root, competing]);
  if (phase !== "create") await expect(runStoreRemote({ ...h.a.ports, migrateStep: async (step) => {
    if (step === (phase === "replace" ? "layout.rename" : "layout.delete")) throw new Error("Keep the original record");
  } }, { remote: "origin", role: "off" })).rejects.toThrow("Keep the original record");
  const initial = (await h.a.exec("git", ["for-each-ref", "--format=%(objectname)", moveRef])).stdout || null;
  expect(initial).not.toBe(competing);
  const ports = { ...h.a.ports, migrateStep: async (step: string) => {
    if (step === (phase === "remove" ? "layout.delete" : "layout.record")) {
      await h.a.exec("git", ["update-ref", moveRef, competing, initial ?? ""]);
    }
  } };
  const running = phase === "create" ? runStoreRemote(ports, { remote: "origin", role: "off" }) : runStoreMigrate(ports);
  await expect(running).rejects.toThrow(/recorded migration changed/u);
  expect((await h.a.exec("git", ["rev-parse", moveRef])).stdout).toBe(competing);
  expect(success(await h.a.store.read({ reference })).content).toBe("Preserve this state.\n");
  expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", moveRef])).stdout).toBe("");
  expect(success(await h.a.store.read({ reference })).content).toBe("Preserve this state.\n");
}, 30_000);

it.each(["{", '{"kind":"layout","source":"default","destination":"default"}'])("refuses a malformed move record and resumes after its repair: %s", async (content) => {
  const h = await moveFixture();
  const planted = await plantRef(h.a.root, moveRef, [{ path: "move.json", content }]);
  const before = (await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  for (const run of [() => runStoreMigrate(h.a.ports), () => runStoreRemote(h.a.ports, { remote: "origin", role: "off" })]) {
    expect(await run()).toMatchObject({ status: "refused", refusal: { code: "move-record-malformed", class: "recoverable",
      condition: expect.stringContaining(moveRef), remedy: { argv: ["arc", "store", "migrate"] } } });
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
    expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
  }
  await h.a.exec("git", ["update-ref", "-d", moveRef, planted.tip]);
  expect((await runStoreMigrate(h.a.ports)).status).toBe("ok");
  expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
  expect(success(await h.a.store.read({ reference })).content).toBe("Preserve this state.\n");
});
