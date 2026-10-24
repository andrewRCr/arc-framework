/** A ref under the history prefix outside the item history grammar is never read as held state. */

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema, runStoreRemote } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const inbox = RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "andrew" } });
const seed = { verb: "user", lifecycleAction: "seed" };

describe.each(["refs/arc/history/archive/2026-q3", "refs/arc/history/project/registry"])("a stray %s", (stray) => {
  const plant = async (exec: (command: string, args: string[]) => Promise<{ stdout: string }>): Promise<void> => {
    const head = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    await exec("git", ["update-ref", stray, head]);
  };

  it("leaves a first write's store directory placement unchanged", async () => {
    const h = await refSyncFixture();
    await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
    await plant(h.a.exec);
    success(await h.a.store.write({ action: "put", expected: null, reference: inbox, content: "# User Inbox\n", provenance: seed }));
    await expect(h.a.ports.fs.lstat(join(h.a.root, ".git", "arc", "store"))).resolves.toBeDefined();
  });

  it("leaves a first backing designation unchanged", async () => {
    const h = await refSyncFixture();
    await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    await plant(h.b.exec);
    const store = createRefStore({ ...h.b.ports, backingRepository: async () => h.origin });
    expect(success(await store.pull()).states).toMatchObject([{ status: "designation-needed", remote: "backing" }]);
  });

  it("reports no unfinished move beside the store directory", async () => {
    const h = await refSyncFixture("separate");
    await plant(h.b.exec);
    expect(success(await h.b.store.pull()).states).toEqual([]);
  });

  it("leaves a backing setting unrefused", async () => {
    const h = await refSyncFixture();
    await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
    await plant(h.a.exec);
    expect(await runStoreRemote({ ...h.a.ports, backingRepository: async () => h.origin }, { remote: "backing", role: "push" }))
      .toMatchObject({ status: "ok" });
  });

  it("stays out of a layout move", async () => {
    const h = await refSyncFixture();
    success(await h.a.store.write({ action: "put", expected: null, reference: inbox, content: "# User Inbox\n", provenance: seed }));
    await plant(h.a.exec);
    expect((await runStoreRemote(h.a.ports, { remote: "origin", role: "off" })).status).toBe("ok");
    const store = [`--git-dir=${join(h.a.root, ".git", "arc", "store")}`, "for-each-ref", "--format=%(refname)"];
    expect((await h.a.exec("git", [...store, "refs/arc/user/"])).stdout).toContain("refs/arc/user/andrew/");
    expect((await h.a.exec("git", [...store, stray])).stdout).toBe("");
  });

  it("leaves an import destination unoccupied", async () => {
    const h = await importFixture();
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["update-ref", stray, head]);
    const trial = await h.migrate(true);
    expect(trial.status, JSON.stringify(trial)).toBe("ok");
  });
});
