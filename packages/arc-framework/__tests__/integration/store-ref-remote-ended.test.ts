/** Interrupted migrations end safely when another mover returns state to the departed receiver. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRemoteMover, oppositeMoveFixture, switchFixture } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";

it.each(["remote.forwarded", "remote.switched", "remote.delete"])("ends without remote writes when a move back overtakes a move paused at %s", async boundary => {
  const h = await oppositeMoveFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === boundary) throw new Error("Paused original move");
  } })).rejects.toThrow("Paused original move");
  expect((await invokeStoreMigrate(["--to", h.origin], h.peerPorts)).status).toBe("ok");
  const beforeSource = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const beforeDestination = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const config = await readFile(h.config, "utf8");
  const ended = await invokeStoreMigrate([], h.ports);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(beforeSource);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(beforeDestination);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect(await readFile(h.config, "utf8")).toBe(config);
  if (ended.status === "ok") expect(ended.result.notices).toEqual(expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("arc store migrate") }),
    expect.objectContaining({ condition: expect.stringContaining("refs/arc/user/andrew/personal") }),
  ]));
}, 60_000);

it.each(["remote.copy", "remote.copied", "remote.forwarded"])("finishes a move back interrupted at %s", async boundary => {
  const h = await oppositeMoveFixture();
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  await expect(invokeStoreMigrate(["--to", h.origin], { ...h.peerPorts, migrateStep: async step => {
    if (step === boundary) throw new Error("Paused move back");
  } })).rejects.toThrow("Paused move back");
  const resumed = await invokeStoreMigrate([], h.peerPorts);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect((await h.remote("git", ["grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.b.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.origin);
  expect((await h.b.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);

it("puts the winning record where an overtaken move back deleted the earlier record", async () => {
  const h = await oppositeMoveFixture();
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  const winner = await createRemoteMover(h, h.destinationDirectory, "onward-clone");
  await expect(invokeStoreMigrate(["--to", h.origin], { ...h.peerPorts, migrateStep: async step => {
    if (step === "remote.copied") throw new Error("Paused move-back copy");
  } })).rejects.toThrow("Paused move-back copy");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  const onward = join(winner.root, "onward.git");
  await winner.exec("git", ["init", "--bare", onward]);
  expect((await invokeStoreMigrate(["--to", onward], winner.ports)).status).toBe("ok");
  const record = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "show", "refs/arc/project/moved:moved.json"])).stdout;
  expect((await invokeStoreMigrate([], h.peerPorts)).status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.remote("git", ["show", "refs/arc/project/moved:moved.json"])).stdout).toBe(record);
  expect((await h.remote("git", ["grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
  expect((await winner.exec("git", [`--git-dir=${onward}`, "grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
  expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect((await h.b.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);

it("preserves a later move off a move-back destination and forwards its old source without deleting", async () => {
  const h = await oppositeMoveFixture();
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  await expect(invokeStoreMigrate(["--to", h.origin], { ...h.peerPorts, migrateStep: async step => {
    if (step === "remote.copied") throw new Error("Paused move-back copy");
  } })).rejects.toThrow("Paused move-back copy");
  const winner = await createRemoteMover(h, h.origin, "returned-clone");
  const onward = join(winner.root, "onward.git");
  await winner.exec("git", ["init", "--bare", onward]);
  expect((await invokeStoreMigrate(["--to", onward], winner.ports)).status).toBe("ok");
  const before = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const record = (await h.remote("git", ["show", "refs/arc/project/moved:moved.json"])).stdout;
  const ended = await invokeStoreMigrate([], h.peerPorts);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "show", "refs/arc/project/moved:moved.json"])).stdout).toBe(record);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
  expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect((await h.b.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);

it("ends a recorded move overtaken at its source while the next first run refuses moved", async () => {
  const h = await switchFixture();
  const loser = await createRemoteMover(h, h.origin, "losing-clone");
  const copy = join(h.a.root, "abandoned.git");
  await h.a.exec("git", ["init", "--bare", copy]);
  await expect(invokeStoreMigrate(["--to", copy], { ...loser.ports, migrateStep: async step => {
    if (step === "remote.copied") throw new Error("Paused copied move");
  } })).rejects.toThrow("Paused copied move");
  expect((await invokeStoreMigrate(["--to", h.to], h.ports)).status).toBe("ok");
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  expect((await invokeStoreMigrate([], loser.ports)).status).toBe("ok");
  const abandoned = (await loser.exec("git", [`--git-dir=${copy}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const first = await invokeStoreMigrate(["--to", copy], loser.ports);
  expect(first).toMatchObject({ status: "refused", refusal: { code: "moved", remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await loser.exec("git", [`--git-dir=${copy}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(abandoned);
  expect((await loser.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
}, 60_000);

it("ends a re-copy that loses its lease to a later move and reports the old refs left published", async () => {
  const h = await oppositeMoveFixture();
  const onward = join(h.b.root, "onward.git");
  await h.b.exec("git", ["init", "--bare", onward]);
  let winner: Awaited<ReturnType<typeof invokeStoreMigrate>> | undefined;
  const ended = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.recopy" && !winner) winner = await invokeStoreMigrate(["--to", onward], h.peerPorts);
  } });
  expect(winner?.status, JSON.stringify(winner)).toBe("ok");
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/user/andrew/personal"])).stdout.trim()).toBe("refs/arc/user/andrew/personal");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.b.exec("git", [`--git-dir=${onward}`, "grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  if (ended.status === "ok") expect(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("refs/arc/user/andrew/personal") }));
}, 60_000);
