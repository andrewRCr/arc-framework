/** Native followers retain unpublished state while a different clone moves the shared project. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { createStoreCommandPorts } from "../../../src/commands/store-ports.js";
import { createRefStore, RecordReferenceSchema } from "../../../src/lib/store/index.js";
import { switchFixture, switchState, productionStore, personal, provenance, capturePeerState, landPreparedOldPush } from "./remote-move.js";
import { preparedRefSync } from "./ref-sync.js";
import { invokeStoreMigrate } from "./migrate-command.js";
import { success } from "./suite-tools.js";
import { invokeStoreRemote } from "./remote-command.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";

/** A follower holding unpublished state, built once per file, whose state another clone moves in each test. */
export async function followFixture(beforeMove?: (h: Awaited<ReturnType<typeof switchFixture>>) => Promise<void>, source: "code" | "backing" = "code") {
  const { followerConfig: config, unpublished, ...prepared } = await preparedRefSync(`follow from ${source}`,
    source === "code" ? "default" : "separate", async (fixture) => {
      const state = await switchState(fixture, source, "backing");
      success(await fixture.b.store.pull());
      const followerConfig = join(fixture.b.root, ".arc", "system", "arc-config.yml");
      await mkdir(join(fixture.b.root, ".arc", "system"), { recursive: true });
      await writeFile(followerConfig, "# The invoking checkout's pointer.\n" + (source === "backing" ? `storage.backing_repository: ${JSON.stringify(fixture.origin)}\n` : ""));
      const reference = RecordReferenceSchema.parse({ ...personal, key: "follower-only.md" });
      success(await productionStore(fixture.b).store.write({ action: "put", reference, expected: null, content: "Unpublished follower data.\n", provenance }));
      return { ...state, followerConfig, unpublished: reference };
    });
  const h = { ...prepared, ...productionStore(prepared.a) };
  const { ports, store } = productionStore(h.b);
  await beforeMove?.(h);
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  expect(success(await store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved", remote: h.sourceName }));
  const pointer = `# The invoking checkout's pointer.\nstorage.backing_repository: ${JSON.stringify(h.destinationDirectory)}\n`;
  await writeFile(config, pointer);
  return { ...h, follower: { ...h.b, ports, store, config, pointer, unpublished } };
}


/** Prepare a new identity's push before the move, then land it after its final source listing. */
export async function lateFollowFixture(land = true, source: "code" | "backing" = "code") {
  let before = new Map<string, string>(), after = new Map<string, string>();
  const late = RecordReferenceSchema.parse({ ...personal, owner: { type: "person", name: "beth" }, key: "late.md" });
  const h = await followFixture(async fixture => {
    before = await capturePeerState(fixture);
    const beth = createRefStore({ ...fixture.b.ports, identity: async () => SlugSchema.parse("beth") });
    success(await beth.write({ action: "put", reference: late, expected: null, content: "Prepared late publication.\n", provenance }));
    after = await capturePeerState(fixture);
  }, source);
  const landLate = async (): Promise<void> => landPreparedOldPush(h, before, after);
  if (land) await landLate();
  return { ...h, late, landLate };
}

/** Bring each checkout's pointer current, follow with explicit publication authority, and converge its writes. */
export async function convergeFollowers(destination: string, clones: readonly { root: string; ports: RefStorePorts }[]) {
  const stores = [];
  for (const clone of clones) {
    await writeFile(join(clone.root, ".arc", "system", "arc-config.yml"), `storage.backing_repository: ${JSON.stringify(destination)}\n`);
    const production = createStoreCommandPorts(clone.root);
    const ports = { ...production, ...clone.ports, backingRepository: production.backingRepository };
    const store = createRefStore(ports);
    const initial = success(await store.pull());
    if (initial.states.some(({ status }) => status === "moved")) {
      const followed = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: clone.root, ports })).result;
      expect(followed.status, JSON.stringify(followed)).toBe("ok");
    }
    expect((await invokeStoreRemote(["--json"], { cwd: clone.root, ports })).result).toMatchObject({ status: "ok",
      result: { remotes: expect.arrayContaining([expect.objectContaining({ role: "push", url: destination })]) } });
    const pushed = success(await store.push());
    expect(pushed.states).toEqual([]);
    expect(pushed.publishes.every(({ status }) => status !== "failed")).toBe(true);
    stores.push(store);
  }
  for (const store of stores) {
    const pulled = success(await store.pull());
    expect(pulled.states).toEqual([]);
    expect(pulled.pulls.every(({ status }) => status !== "failed")).toBe(true);
    expect(pulled.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "history-diverged")).toBe(false);
  }
  return stores;
}
