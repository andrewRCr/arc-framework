/** Movers and already-followed clones return to the old home only after its forwarding control is withdrawn. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { createRefStore } from "../../src/lib/store/index.js";
import { switchFixture, personal } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["code", "backing"] as const)("re-homes mover and followed clone after restoring a %s pointer", async source => {
  const h = await switchFixture(source, "backing"); success(await h.b.store.pull());
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Pause before cleanup");
  } })).rejects.toThrow("Pause before cleanup");
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  await writeFile(config, await readFile(h.config, "utf8"));
  const production = createStoreCommandPorts(h.b.root), ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  const follower = createRefStore(ports); success(await follower.pull());
  expect((await invokeStoreRemote(["backing", "read", "--json"], { cwd: h.b.root, ports })).result.status).toBe("ok");
  success(await follower.pull());
  await rm(h.destinationDirectory, { recursive: true, force: true });
  const target = source === "code" ? "origin" : h.origin;
  if (source === "backing") await production.writeBackingRepository?.(h.origin);
  expect(await invokeStoreMigrate(["--leave-source", "--to", target], ports)).toMatchObject({ status: "refused", refusal: { code: "moved" } });
  const ended = await invokeStoreMigrate(["--leave-source"], h.ports);
  expect(ended).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ remedy: { text: expect.stringContaining(source === "code" ? "Remove storage.backing_repository" : "Restore storage.backing_repository") } }),
  ]) } });
  await h.ports.writeBackingRepository?.(source === "backing" ? h.origin : null);
  await production.writeBackingRepository?.(source === "backing" ? h.origin : null);
  for (const current of [h.ports, ports]) expect((await invokeStoreMigrate(["--leave-source", "--to", target], current)).status).toBe("ok");
  for (const store of [h.store, follower]) {
    expect(success(await store.push()).states).toEqual([]);
    expect(success(await store.pull()).states).toEqual([]);
    expect(success(await store.read({ reference: personal })).content).toBe("Shared state.\n");
  }
  expect(await createStoreCommandPorts(h.a.root).backingRepository()).toBe(source === "code" ? null : h.origin);
}, 60_000);
