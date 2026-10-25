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

it.each(["push", "read", "off"] as const)("preserves comparison heads for an unchanged rewritten backing URL set to %s", async role => {
  const h = await oppositeMoveIntoCodeFixture(), state = "refs/arc/user/andrew/personal";
  await h.remote("git", ["update-ref", "-d", state, h.sourcePersonal]);
  success(await h.store.pull());
  const roots = ["refs/arc-remotes/backing/", "refs/arc/tmp/seen/backing/"];
  const heads = () => h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", ...roots]).then(result => result.stdout);
  const before = await heads();
  expect(before).toContain("refs/arc-remotes/backing/project/registry");
  expect(before).toContain("refs/arc/tmp/seen/backing/user/andrew/personal");
  const alias = await rewriteUrls(h.a.root, "arc-unchanged:", h.origin);
  await h.a.git(["remote", "set-url", "backing", alias]);
  await h.ports.writeBackingRepository?.(alias);
  for (let attempt = 0; attempt < 2; attempt++) {
    expect((await invokeStoreRemote(["backing", role, "--json"], { cwd: h.a.root, ports: h.ports })).result)
      .toMatchObject({ status: "ok" });
    expect(await heads()).toBe(before);
    expect((await h.a.git(["config", "--get", "remote.backing.url"])).stdout.trim()).toBe(alias);
    expect((await h.a.git(["config", "--get", "remote.backing.arc-state"])).stdout.trim()).toBe(role);
  }
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.a.root, ports: h.ports })).result)
    .toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
  expect(success(await h.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", state])).stdout.trim()).toBe(state);
});

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
