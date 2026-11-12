/** Native record endings distinguish a lost destination from failed source cleanup. */
import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { switchFixture } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("withdraws only its own forwarding record when the copied destination is deleted", async () => {
  const h = await switchFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Pause before deletes");
  } })).rejects.toThrow("Pause before deletes");
  const before = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const registry = (await h.remote("git", ["rev-parse", "refs/arc/project/registry"])).stdout.trim();
  const tree = (await h.remote("git", ["rev-parse", "refs/arc/project/registry^{tree}"])).stdout.trim();
  const pointer = await readFile(h.config, "utf8");
  await rm(h.destinationDirectory, { recursive: true, force: true });
  expect(await invokeStoreMigrate([], h.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
  expect(await invokeStoreMigrate(["--leave-source", "--to", "origin"], h.ports)).toMatchObject({ status: "refused", refusal: { code: "request-invalid" } });
  let raced = "";
  const ended = await invokeStoreMigrate(["--leave-source"], { ...h.ports, migrateStep: async step => {
    if (step !== "leave.withdraw" || raced) return;
    raced = (await h.remote("git", ["-c", "user.name=Concurrent publisher", "-c", "user.email=publisher@example.com", "commit-tree", tree, "-p", registry, "-m", "Concurrent registry publication"])).stdout.trim();
    await h.remote("git", ["update-ref", "refs/arc/project/registry", raced, registry]);
  } });
  expect(ended).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("pointer"), remedy: expect.anything() }),
  ]) } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect((await h.remote("git", ["rev-parse", "refs/arc/project/registry"])).stdout.trim()).not.toBe(registry);
  expect((await h.remote("git", ["rev-parse", "refs/arc/project/registry"])).stdout.trim()).not.toBe(raced);
  expect((await h.remote("git", ["rev-list", "refs/arc/project/registry"])).stdout.split("\n")).toContain(raced);
  expect((await h.remote("git", ["rev-parse", "refs/arc/project/registry^{tree}"])).stdout.trim()).toBe(tree);
  expect(await readFile(h.config, "utf8")).toBe(pointer);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);

it("keeps a failed withdrawal restartable and names the hand-ending route", async () => {
  const h = await switchFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.forwarded") throw new Error("Pause before switch");
  } })).rejects.toThrow("Pause before switch");
  const move = (await h.a.exec("git", ["rev-parse", "refs/arc/tmp/migrate/move"])).stdout;
  await rm(h.destinationDirectory, { recursive: true, force: true });
  await rename(h.origin, h.origin + ".offline");
  const missing = await invokeStoreMigrate(["--leave-source"], h.ports);
  expect(missing).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "unreachable", remedy: { text: expect.stringContaining("git update-ref -d refs/arc/tmp/migrate/move") },
  } } });
  await rename(h.origin + ".offline", h.origin);
  const hook = join(h.origin, "hooks", "pre-receive");
  await writeFile(hook, "#!/bin/sh\nexit 1\n"); await chmod(hook, 0o755);
  const readonly = await invokeStoreMigrate(["--leave-source"], h.ports);
  expect(readonly).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "refused", class: "terminal", remedy: { text: expect.stringContaining("git update-ref -d refs/arc/tmp/migrate/move") },
  } } });
  expect((await h.a.exec("git", ["rev-parse", "refs/arc/tmp/migrate/move"])).stdout).toBe(move);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout.trim()).toBe("refs/arc/project/moved");
  await rm(hook);
  await expect(invokeStoreMigrate(["--leave-source"], { ...h.ports, migrateStep: async step => {
    if (step === "leave.withdrawn") throw new Error("Pause after withdrawal");
  } })).rejects.toThrow("Pause after withdrawal");
  expect((await h.a.exec("git", ["rev-parse", "refs/arc/tmp/migrate/move"])).stdout).toBe(move);
  expect((await invokeStoreMigrate(["--leave-source"], h.ports)).status).toBe("ok");
}, 60_000);

it("ends a pre-switch move at a deleted destination with no pointer to revert and keeps syncing with the source", async () => {
  const h = await switchFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.forwarded") throw new Error("Pause before switch");
  } })).rejects.toThrow("Pause before switch");
  const pointer = await readFile(h.config, "utf8");
  await rm(h.destinationDirectory, { recursive: true, force: true });
  const ended = await invokeStoreMigrate(["--leave-source"], h.ports);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  if (ended.status !== "ok") throw new Error("Leaving refused");
  expect(ended.result.notices.map(({ condition }) => condition).join("\n")).not.toMatch(/tracked pointer/u);
  expect(ended.result.notices).toContainEqual({ condition: expect.stringContaining(`stays on its source ${h.origin}`) });
  expect(ended.result.notices.map(({ remedy }) => remedy?.text ?? "").join("\n")).not.toMatch(/leave the unavailable source/u);
  expect(await readFile(h.config, "utf8")).toBe(pointer);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect(success(await h.store.push()).states).toEqual([]);
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
}, 60_000);

it("ends a pre-switch move at a deleted destination unswitched though the checkout's pointer already names that destination", async () => {
  const h = await switchFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.forwarded") throw new Error("Pause before switch");
  } })).rejects.toThrow("Pause before switch");
  await writeFile(h.config, `${await readFile(h.config, "utf8")}storage.backing_repository: ${JSON.stringify(h.to)}\n`);
  const pointer = await readFile(h.config, "utf8");
  await rm(h.destinationDirectory, { recursive: true, force: true });
  const ended = await invokeStoreMigrate(["--leave-source"], h.ports);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  if (ended.status !== "ok") throw new Error("Leaving refused");
  expect(ended.result.notices.map(({ condition }) => condition).join("\n")).not.toMatch(/tracked pointer/u);
  expect(await readFile(h.config, "utf8")).toBe(pointer);
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  await expect(h.ports.fs.lstat(join(h.a.root, ".git", "arc", "store"))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);

it("finishes a begun switch from its record before ending it at a departed source", async () => {
  const h = await switchFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "layout.designation") throw new Error("Pause inside switch");
  } })).rejects.toThrow("Pause inside switch");
  await rm(h.origin, { recursive: true, force: true });
  const ended = await invokeStoreMigrate(["--leave-source"], h.ports);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("off");
  expect((await invokeStoreRemote(["--json"], { cwd: h.a.root, ports: h.ports })).result).toMatchObject({ status: "ok", result: {
    layout: "separate", remotes: expect.arrayContaining([expect.objectContaining({ name: "backing", role: "push", url: h.destinationDirectory })]) } });
  expect(success(await h.store.pull()).states).toEqual([]);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);
