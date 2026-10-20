/** A responding destination keeps authority even when its state refs have been emptied. */
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { createRefStore } from "../../src/lib/store/index.js";
import { switchFixture } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it.each([false, true])("does not withdraw a source when the destination answers (empty=%s)", async empty => {
  const h = await switchFixture(); success(await h.b.store.pull());
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Pause before cleanup");
  } })).rejects.toThrow("Pause before cleanup");
  success(await h.store.pull());
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  if (empty) {
    const refs = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
    for (const ref of refs) await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "update-ref", "-d", ref]);
    expect(await invokeStoreMigrate([], h.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
  }
  expect((await invokeStoreMigrate(["--leave-source"], h.ports)).status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect(success(await h.store.push()).states).toEqual([]);
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  await writeFile(config, await readFile(h.config, "utf8"));
  const production = createStoreCommandPorts(h.b.root), ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  const follower = createRefStore(ports); success(await follower.pull());
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.b.root, ports })).result.status).toBe("ok");
  for (const store of [h.store, follower]) expect(success(await store.pull()).states).toEqual([]);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
}, 60_000);

it("ends read-only source cleanup without unpublishing it, then permits another move and layout setting", async () => {
  const h = await switchFixture(), hook = join(h.origin, "hooks", "pre-receive");
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Pause before cleanup");
  } })).rejects.toThrow("Pause before cleanup");
  await writeFile(hook, "#!/bin/sh\nexit 1\n"); await chmod(hook, 0o755);
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  for (let attempt = 0; attempt < 2; attempt++) expect(await invokeStoreMigrate([], h.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
  expect((await invokeStoreMigrate(["--leave-source"], h.ports)).status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  const next = join(h.a.root, "next.git"); await h.a.exec("git", ["init", "--bare", next]);
  expect((await invokeStoreMigrate(["--to", next], h.ports)).status).toBe("ok");
  expect((await invokeStoreRemote(["backing", "off", "--json"], { cwd: h.a.root, ports: h.ports })).result.status).toBe("ok");
  await h.a.exec("git", ["remote", "set-url", "origin", next]); await writeFile(h.config, "# Code home.\n");
  expect((await invokeStoreRemote(["origin", "push", "--json"], { cwd: h.a.root, ports: h.ports })).result.status).toBe("ok");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/user/andrew/personal"])).stdout.trim()).toBe("refs/arc/user/andrew/personal");
  await rm(hook);
}, 60_000);
