import { expect, it } from "vitest";
import { join } from "node:path";
import { switchFixture } from "../helpers/store/remote-move.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("uses only the tracked pointer for a move to backing, preserving a same-named code remote", async () => {
  const h = await switchFixture("code", "backing"), reserved = join(h.a.root, "reserved.git");
  await h.a.exec("git", ["init", "--bare", reserved]);
  await h.a.exec("git", ["remote", "add", "backing", reserved]);
  await h.a.exec("git", ["config", "remote.backing.arc-state", "push"]);
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const local = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const refused = await invokeStoreMigrate(["--to", "backing"], h.ports);
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "request-invalid", class: "terminal", condition: expect.stringMatching(/pointer|backing_repository/iu) } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(local);
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
  if (!h.ports.writeBackingRepository) throw new Error("Expected the production pointer writer");
  await h.ports.writeBackingRepository(h.destinationDirectory);
  expect((await invokeStoreMigrate(["--to", "backing"], h.ports)).status).toBe("ok");
  expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(h.destinationDirectory);
  expect((await h.a.exec("git", ["remote", "get-url", "backing"])).stdout).toBe(reserved);
  expect((await h.a.exec("git", [`--git-dir=${reserved}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
});

it("uses only the tracked pointer for a source departure to backing", async () => {
  const h = await followFixture(), follower = h.follower, reserved = join(follower.root, "reserved.git");
  await follower.exec("git", ["init", "--bare", reserved]);
  await follower.exec("git", [`--git-dir=${reserved}`, "fetch", "--no-write-fetch-head", "--no-tags", "--", h.destinationDirectory, "+refs/arc/*:refs/arc/*"]);
  await follower.exec("git", ["remote", "add", "backing", reserved]);
  await follower.exec("git", ["config", "remote.backing.arc-state", "off"]);
  const listing = async () => (await follower.exec("git", [`--git-dir=${reserved}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const before = await listing();
  const refused = await invokeStoreMigrate(["--leave-source", "--to", "backing"], { ...follower.ports, backingRepository: async () => null });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "request-invalid", class: "terminal", condition: expect.stringMatching(/pointer|backing_repository/iu) } });
  expect(await listing()).toBe(before);
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
  expect((await invokeStoreMigrate(["--leave-source", "--to", "backing"], follower.ports)).status).toBe("ok");
  expect((await follower.git(["remote", "get-url", "backing"])).stdout).toBe(h.destinationDirectory);
  expect((await follower.exec("git", ["remote", "get-url", "backing"])).stdout).toBe(reserved);
  expect(await listing()).toBe(before);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
});

it("does not count a code remote named backing as the source publisher of a departure", async () => {
  const h = await followFixture(), follower = h.follower, reserved = join(follower.root, "reserved.git");
  await follower.exec("git", ["init", "--bare", reserved]);
  await follower.exec("git", ["remote", "add", "backing", reserved]);
  await follower.exec("git", ["config", "remote.backing.arc-state", "push"]);
  await follower.exec("git", ["remote", "add", "state-home", h.destinationDirectory]);
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const result = await invokeStoreMigrate(["--leave-source", "--to", "state-home"], follower.ports);
  expect(result.status, JSON.stringify(result)).toBe("ok");
  const view = (await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result;
  expect(view).toMatchObject({ status: "ok", result: { remotes: expect.arrayContaining([expect.objectContaining({ name: "state-home", role: "push", repository: "code" })]) } });
  expect((await follower.exec("git", ["remote", "get-url", "backing"])).stdout).toBe(reserved);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
});
