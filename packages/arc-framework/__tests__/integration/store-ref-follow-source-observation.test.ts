/** Disabling an observed source needs no publication transport authority. */
import { join } from "node:path";
import { expect, it } from "vitest";
import { followFixture } from "../helpers/store/follow.js";
import { followAccountAdvisory, followAccountFixture, interruptFollowAccount } from "../helpers/store/follow-account.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

const cases = (["code", "backing"] as const).flatMap(source => [
  ...(["empty", "multiple", "invalid", "push-rewrite"] as const).map(fault => ({ source, fault, journal: "matching" as const })),
  ...(["absent", "unrelated"] as const).map(journal => ({ source, fault: "multiple" as const, journal })),
]);

it.each(cases)("turns the $source source off with $fault push transport and $journal account", async ({ source, fault, journal }) => {
  const account = journal === "absent" ? undefined : await followAccountFixture(source);
  if (account) await interruptFollowAccount(account, "confirmed");
  const h = account?.h ?? await followFixture(undefined, source), follower = h.follower;
  const ports = account?.ports ?? follower.ports, name = source === "code" ? "origin" : "backing";
  const sourceGit = (args: string[]) => follower.exec("git", [...source === "backing" ? [`--git-dir=${join(follower.root, ".git", "arc", "store")}`] : [], ...args]);
  const pending = async () => (await follower.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/tmp/migrate/pending-copy/"])).stdout;
  const beforePending = await pending();
  if (account) expect(beforePending).toContain("/record");
  const beforeRemote = async (directory: string) => (await follower.exec("git", [`--git-dir=${directory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const original = await beforeRemote(h.origin), destination = await beforeRemote(h.destinationDirectory);
  if (journal === "unrelated") await sourceGit(["remote", "set-url", name, h.origin + "/."]);
  const key = `remote.${name}.pushurl`;
  if (fault === "empty") await sourceGit(["config", key, ""]);
  else if (fault === "multiple") {
    await sourceGit(["config", "--add", key, h.origin]);
    await sourceGit(["config", "--add", key, h.destinationDirectory]);
  } else if (fault === "invalid") await sourceGit(["config", key, "invalid\npush-only"]);
  else await sourceGit(["config", "url.invalid\rpush-only.pushInsteadOf", h.origin]);

  const result = (await invokeStoreRemote([name, "off", "--json"], { cwd: follower.root, ports })).result;
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status !== "ok") throw new Error("Source-off refused");
  expect(result.result.remotes).toContainEqual(expect.objectContaining({ name, role: "off" }));
  expect(await beforeRemote(h.origin)).toBe(original);
  expect(await beforeRemote(h.destinationDirectory)).toBe(destination);
  if (journal === "matching") {
    expect(result.result.report?.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining(followAccountAdvisory.condition) }));
    expect(await pending()).toBe("");
  } else if (journal === "unrelated") {
    expect(await pending()).toBe(beforePending);
    // Restore exactly the original observation identity; the retained account can now be retired.
    await sourceGit(["remote", "set-url", name, h.origin]);
    await sourceGit(["config", `remote.${name}.arc-state`, "push"]);
    const retry = (await invokeStoreRemote([name, "off", "--json"], { cwd: follower.root, ports })).result;
    expect(retry.status, JSON.stringify(retry)).toBe("ok");
    expect(await pending()).toBe("");
  } else expect(await pending()).toBe("");
}, 60_000);

it.each(["code", "backing"] as const)("propagates a local %s observation failure and retries after repair", async source => {
  const h = await followFixture(undefined, source), follower = h.follower, name = source === "code" ? "origin" : "backing";
  const failure = makeGitProcessError({ command: "git", args: ["remote", "get-url", name], exitCode: 128, stderr: "Local source observation failed" });
  const ports = { ...follower.ports, exec: async (...args: Parameters<typeof follower.ports.exec>) => {
    if (args[1].includes("remote") && args[1].includes("get-url") && !args[1].includes("--push")) throw failure;
    return follower.ports.exec(...args);
  } };
  await expect(invokeStoreRemote([name, "off", "--json"], { cwd: follower.root, ports })).rejects.toBe(failure);
  expect((await follower.git(["config", `remote.${name}.arc-state`])).stdout.trim()).toBe("push");
  expect((await invokeStoreRemote([name, "off", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
}, 60_000);


it.each(["code", "backing"] as const)("keeps invalid %s fetch configuration typed and accepts a repaired observation", async source => {
  const account = await followAccountFixture(source);
  await interruptFollowAccount(account, "confirmed");
  const { h } = account, follower = h.follower, name = source === "code" ? "origin" : "backing";
  const sourceGit = (args: string[]) => follower.exec("git", [...source === "backing" ? [`--git-dir=${join(follower.root, ".git", "arc", "store")}`] : [], ...args]);
  const pending = async () => (await follower.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/tmp/migrate/pending-copy/"])).stdout;
  const before = await pending();
  await sourceGit(["config", `remote.${name}.url`, "invalid\nfetch"]);
  const result = (await invokeStoreRemote([name, "off", "--json"], { cwd: follower.root, ports: account.ports })).result;
  expect(result).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable", condition: expect.stringContaining("fetch endpoint") } });
  expect(await pending()).toBe(before);
  expect((await sourceGit(["config", `remote.${name}.arc-state`])).stdout.trim()).toBe("push");
  await sourceGit(["config", `remote.${name}.url`, h.origin]);
  expect((await invokeStoreRemote([name, "off", "--json"], { cwd: follower.root, ports: account.ports })).result.status).toBe("ok");
  expect(await pending()).toBe("");
}, 60_000);
