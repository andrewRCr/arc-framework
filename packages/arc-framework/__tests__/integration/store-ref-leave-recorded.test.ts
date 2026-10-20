/** Native record endings distinguish a lost destination from failed source cleanup. */
import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { switchFixture } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";

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
