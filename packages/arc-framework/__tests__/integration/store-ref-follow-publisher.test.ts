import { expect, it } from "vitest";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("refuses a follow's second publisher and can follow read while keeping the existing publisher", async () => {
  const h = await followFixture(), follower = h.follower, publisher = join(follower.root, "publisher.git");
  await writeFile(follower.config, "# Follow the code remote while retaining this clone's publisher.\n");
  await follower.exec("git", ["config", "remote.origin.arc-state", "read"]);
  await follower.exec("git", ["remote", "add", "state-home", h.destinationDirectory]);
  await follower.exec("git", ["config", "remote.state-home.arc-state", "off"]);
  await follower.exec("git", ["init", "--bare", publisher]);
  await follower.exec("git", [`--git-dir=${publisher}`, "fetch", "--no-write-fetch-head", "--no-tags", "--", h.destinationDirectory, "+refs/arc/*:refs/arc/*"]);
  await follower.exec("git", ["remote", "add", "publisher", publisher]);
  await follower.exec("git", ["config", "remote.publisher.arc-state", "push"]);
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const destination = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const refused = (await invokeStoreRemote(["state-home", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "role-conflict", class: "recoverable",
    condition: expect.stringContaining("publisher"), remedy: { argv: ["arc", "store", "remote", "state-home", "read"] } } });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect((await follower.exec("git", ["config", "remote.publisher.arc-state"])).stdout).toBe("push");
  expect((await follower.exec("git", ["config", "remote.state-home.arc-state"])).stdout).toBe("off");
  expect((await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destination);
  expect((await invokeStoreRemote(["state-home", "read", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  const viewed = (await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(viewed).toMatchObject({ status: "ok", result: { remotes: expect.arrayContaining([
    expect.objectContaining({ name: "publisher", role: "push" }), expect.objectContaining({ name: "state-home", role: "read" }),
  ]) } });
  if (viewed.status === "ok") expect(viewed.result.remotes.filter(({ role }) => role === "push")).toHaveLength(1);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  const pushed = success(await follower.store.push());
  expect(pushed.states).toEqual([]);
  expect(pushed.publishes.every(({ status }) => status !== "failed")).toBe(true);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await follower.exec("git", [`--git-dir=${publisher}`, "grep", "-F", "Unpublished follower data.", "refs/arc/user/andrew/personal"])).stdout).toContain("Unpublished follower data.");
});
