/** Ending a move back retains any forwarding root its earlier copy removed. */
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { switchFixture } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
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
