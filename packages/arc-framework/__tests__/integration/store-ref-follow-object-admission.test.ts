/** Forwarding object identity must establish a commit before ancestry can decide a follow. */
import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

it.each((["code", "backing"] as const).flatMap(source => (["pointer", "code-remote"] as const)
  .flatMap(route => (["blob", "tree"] as const).map(type => ({ source, route, type })))))(
  "rejects a forwarded $type through $route from $source and accepts its repaired commit", async ({ source, route, type }) => {
  const h = await followFixture(undefined, source), follower = h.follower;
  if (route === "code-remote") {
    await writeFile(follower.config, "# Candidate is a named code remote.\n");
    await follower.exec("git", ["remote", "add", "candidate", h.destinationDirectory]);
    await follower.exec("git", ["config", "remote.candidate.arc-state", "off"]);
  }
  const original = (await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim();
  const record = JSON.parse((await h.remote("git", ["show", `${original}:moved.json`])).stdout) as { projectId: string; registryCommit: string };
  const object = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse",
    type === "tree" ? "refs/arc/project/registry^{tree}" : "refs/arc/project/registry:identity.json"])).stdout.trim();
  const malformed = await plantRef(h.origin, "refs/arc/project/moved", [{ path: "moved.json", content: JSON.stringify({ ...record, registryCommit: object }) }], { gitDir: h.origin });
  const local = (await follower.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/", "refs/arc-remotes/"])).stdout;
  const roles = (await follower.git(["config", "--get-regexp", "arc-state$"])).stdout;
  const refused = await invokeStoreMigrate([], follower.ports);
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "follow-refused", class: "recoverable",
    condition: expect.stringContaining("move's commit"), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await follower.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/", "refs/arc-remotes/"])).stdout).toBe(local);
  expect((await follower.git(["config", "--get-regexp", "arc-state$"])).stdout).toBe(roles);
  expect((await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim()).toBe(malformed.tip);
  await h.remote("git", ["update-ref", "refs/arc/project/moved", original, malformed.tip]);
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: route === "pointer" ? "backing" : "candidate" });
}, 60_000);

it.each(["code", "backing"] as const)("propagates local commit-type observation failure from %s and recovers", async source => {
  const h = await followFixture(undefined, source), follower = h.follower;
  const failure = makeGitProcessError({ command: "git", args: ["cat-file", "-t"], exitCode: 128, stderr: "Local type read failed" });
  const ports = { ...follower.ports, exec: async (...args: Parameters<typeof follower.ports.exec>) => {
    if (args[1][0] === "cat-file" && args[1][1] === "-t") throw failure;
    return follower.ports.exec(...args);
  } };
  await expect(invokeStoreMigrate([], ports)).rejects.toBe(failure);
  expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
}, 60_000);
