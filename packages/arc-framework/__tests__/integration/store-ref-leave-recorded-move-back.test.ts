/** Ending a move back retains any forwarding root its earlier copy removed, and withdraws a record it landed. */
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { followFixture } from "../helpers/store/follow.js";
import { switchFixture } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["deleted", "refuses-copy"])("ends a move back before switching when its destination %s", async failure => {
  const h = await switchFixture();
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  const forwarding = (await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim();
  await expect(invokeStoreMigrate(["--to", "origin"], { ...h.ports, migrateStep: async step => {
    if (step === "remote.copied") throw new Error("Pause move back");
  } })).rejects.toThrow("Pause move back");
  const pointer = await readFile(h.config, "utf8");
  if (failure === "deleted") await rm(h.origin, { recursive: true, force: true });
  else {
    const hook = join(h.origin, "hooks", "pre-receive");
    await writeFile(hook, "#!/bin/sh\nexit 1\n"); await chmod(hook, 0o755);
    expect(await invokeStoreMigrate([], h.ports)).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "refused" } } });
    expect.soft((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/pending-copy/"])).stdout).toBe("");
    expect((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/copied/report"])).stdout).toContain("refs/arc/project/registry");
  }
  const ended = await invokeStoreMigrate(["--leave-source"], h.ports);
  expect(ended).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining(forwarding), remedy: { text: expect.stringContaining("refs/arc/tmp/migrate/deleted-record") } }),
  ]) } });
  expect((await h.a.exec("git", ["rev-parse", "refs/arc/tmp/migrate/deleted-record"])).stdout.trim()).toBe(forwarding);
  expect(await readFile(h.config, "utf8")).toBe(pointer);
  expect(success(await h.store.pull()).states).toEqual([]);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  if (failure === "refuses-copy") {
    await rm(join(h.origin, "hooks", "pre-receive"));
    await h.a.exec("git", ["push", `--force-with-lease=refs/arc/project/moved:`, "--", h.origin, "refs/arc/tmp/migrate/deleted-record:refs/arc/project/moved"]);
    expect((await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim()).toBe(forwarding);
    const next = join(h.a.root, "next-home.git"); await h.a.exec("git", ["init", "--bare", next]);
    await expect(invokeStoreMigrate(["--to", next], { ...h.ports, migrateStep: async step => {
      if (step === "remote.copied") throw new Error("Pause later move");
    } })).rejects.toThrow("Pause later move");
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/deleted-record"])).stdout).toBe("");
    const later = await invokeStoreMigrate(["--leave-source"], h.ports);
    expect(later.status).toBe("ok");
    if (later.status === "ok") expect(later.result.notices.some(({ condition }) => condition.includes(forwarding))).toBe(false);
  }
}, 60_000);

it("withdraws a move back's landed forwarding record once its destination went, every clone syncing with its source", async () => {
  const h = await followFixture();
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.follower.root, ports: h.follower.ports })).result.status).toBe("ok");
  const source = (args: string[]) => h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, ...args]);
  await expect(invokeStoreMigrate(["--to", "origin"], { ...h.ports, migrateStep: async step => {
    if (step === "remote.forwarded") throw new Error("Pause move back");
  } })).rejects.toThrow("Pause move back");
  expect((await source(["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect(success(await h.follower.store.pull()).states).toContainEqual(expect.objectContaining({ status: "moved" }));
  const pointer = await readFile(h.config, "utf8");
  await rm(h.origin, { recursive: true, force: true });
  expect(await invokeStoreMigrate(["--leave-source"], h.ports)).toMatchObject({ status: "ok" });
  expect((await source(["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  expect(await readFile(h.config, "utf8")).toBe(pointer);
  for (const store of [h.store, h.follower.store]) {
    expect(success(await store.pull()).states).toEqual([]);
    expect(success(await store.push()).states).toEqual([]);
  }
  expect((await source(["grep", "-F", "Unpublished follower data.", "refs/arc/user/andrew/personal"])).stdout).toContain("Unpublished follower data.");
}, 60_000);
