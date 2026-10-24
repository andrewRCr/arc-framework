/** Moves compare and restore the URLs a person configured, whatever a URL rewrite makes of them on the wire. */
import { writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { oppositeMoveFixture, oppositeMoveIntoCodeFixture, createRemoteMover } from "../helpers/store/remote-move.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

/** Rewrite `prefix` to the directory holding `repository` for every Git command, as a person's global rule does. */
async function rewriteUrls(root: string, prefix: string, repository: string): Promise<string> {
  const config = join(root, "global.gitconfig");
  await writeFile(config, `[url "${dirname(repository)}/"]\n\tinsteadOf = ${prefix}\n`);
  vi.stubEnv("GIT_CONFIG_GLOBAL", config); onTestFinished(() => { vi.unstubAllEnvs(); });
  return `${prefix}${basename(repository)}`;
}

function pauseAt(boundary: string): (step: string) => Promise<void> {
  return async step => { if (step === boundary) throw new Error(`Paused at ${boundary}`); };
}

it("keeps a completed switch onto a rewritten backing URL that a move back then overtakes", async () => {
  const h = await oppositeMoveFixture(), alias = await rewriteUrls(h.a.root, "arc-destination:", h.destinationDirectory);
  await expect(invokeStoreMigrate(["--to", alias], { ...h.ports, migrateStep: pauseAt("remote.switched") })).rejects.toThrow("Paused at remote.switched");
  expect((await invokeStoreMigrate(["--to", h.origin], h.peerPorts)).status).toBe("ok");
  const ended = await invokeStoreMigrate([], h.ports);
  expect(ended).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("after its switch") })]) } });
  expect(await h.ports.backingRepository()).toBe(alias);
  expect((await invokeStoreRemote(["--json"], { cwd: h.a.root, ports: h.ports })).result).toMatchObject({ status: "ok", result: {
    layout: "separate", remotes: expect.arrayContaining([expect.objectContaining({ name: "backing", role: "push", url: alias })]) } });
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("off");
}, 60_000);

it("restores a rewritten backing URL and pointer as configured when a move back overtakes the switch", async () => {
  const h = await oppositeMoveIntoCodeFixture(), alias = await rewriteUrls(h.a.root, "arc-home:", h.origin);
  await h.a.exec("git", [`--git-dir=${join(h.a.root, ".git", "arc", "store")}`, "remote", "set-url", "backing", alias]);
  await h.ports.writeBackingRepository?.(alias);
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: pauseAt("layout.designation") })).rejects.toThrow("Paused at layout.designation");
  expect((await invokeStoreMigrate(["--to", "origin"], h.peerPorts)).status).toBe("ok");
  const undone = await invokeStoreMigrate([], h.ports);
  expect(undone).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("during its switch") })]) } });
  expect(await h.ports.backingRepository()).toBe(alias);
  expect((await invokeStoreRemote(["--json"], { cwd: h.a.root, ports: h.ports })).result).toMatchObject({ status: "ok", result: {
    layout: "separate", remotes: expect.arrayContaining([expect.objectContaining({ name: "backing", role: "push", url: alias })]) } });
  expect(success(await h.store.pull()).states).toEqual([]);
}, 60_000);

it("keeps a completed backing-to-backing follow whose new backing then reports a later move", async () => {
  const h = await followFixture(undefined, "backing"), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root,
    ports: { ...follower.ports, migrateStep: pauseAt("follow.switched") } })).rejects.toThrow("Paused at follow.switched");
  const mover = await createRemoteMover(h, h.destinationDirectory, "onward-mover"), onward = join(mover.root, "onward.git");
  await mover.exec("git", ["init", "--bare", onward]);
  expect((await invokeStoreMigrate(["--to", onward], mover.ports)).status).toBe("ok");
  success(await follower.store.pull());
  expect((await follower.git(["for-each-ref", "--format=%(refname)", "refs/arc-remotes/backing/project/moved"])).stdout.trim())
    .toBe("refs/arc-remotes/backing/project/moved");
  const finished = await invokeStoreMigrate([], follower.ports);
  expect(finished).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("A later move ended this follow's cleanup") })]) } });
  expect((await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result).toMatchObject({ status: "ok", result: {
    remotes: expect.arrayContaining([expect.objectContaining({ name: "backing", role: "push", url: h.destinationDirectory })]) } });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);
