/** A paused publisher in another checkout re-reads the shared follow designation before any push. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { createRefStore, type Store } from "../../src/lib/store/index.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("restarts a second worktree's already-pulled publisher after the follow and shares its layout and roles", async () => {
  let resume: () => void = () => {}, syncing: ReturnType<Store["push"]> | undefined;
  try {
    let sibling = "";
    const h = await followFixture(async fixture => {
      success(await fixture.store.push());
      sibling = join(fixture.b.root, "follow-sibling");
      await fixture.b.exec("git", ["worktree", "add", "--detach", sibling, "HEAD"]);
      await mkdir(join(sibling, ".arc", "system"), { recursive: true });
      await writeFile(join(sibling, ".arc", "system", "arc-config.yml"), `storage.backing_repository: ${JSON.stringify(fixture.destinationDirectory)}\n`);
      const native = createStoreCommandPorts(sibling);
      let fetched = false, merged = false, held = false, stopped = false, announce: () => void = () => {};
      const paused = new Promise<void>(resolve => { announce = resolve; });
      const continued = new Promise<void>(resolve => { resume = resolve; });
      syncing = createRefStore({ ...native, exec: async (command, args, options) => {
        const result = await native.exec(command, args, options);
        if (args.includes("fetch")) fetched = true;
        if (merged && held && !stopped && args.includes("for-each-ref") && args.at(-1) === "refs/arc/") {
          stopped = true; announce(); await continued;
        }
        return result;
      }, lock: async (name, wait) => {
        const release = await native.lock(name, wait);
        if (name === "refs/arc/user/andrew/personal") held = true;
        return async () => {
          await release();
          if (name === "layout" && fetched) merged = true;
          if (name === "refs/arc/user/andrew/personal") held = false;
        };
      } }).push();
      syncing.catch(() => {});
      await Promise.race([paused, syncing.then(result => { throw new Error(`The push ended before its captured listing: ${JSON.stringify(result)}`); })]);
    });
    expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: h.follower.root, ports: h.follower.ports })).result.status).toBe("ok");
    resume();
    if (!syncing) throw new Error("The sibling publisher did not start");
    success(await syncing);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Unpublished follower data.", "refs/arc/user/andrew/personal"])).stdout).toContain("Unpublished follower data.");
    const peerPorts = createStoreCommandPorts(sibling), peer = createRefStore(peerPorts);
    // A checkout of a branch older than the move carries no pointer; the clone's designation still governs it.
    const older = join(h.follower.root, "older-checkout");
    await h.follower.exec("git", ["worktree", "add", "--detach", older, "HEAD"]);
    const olderPorts = createStoreCommandPorts(older);
    expect(await olderPorts.backingRepository()).toBeNull();
    for (const ports of [h.follower.ports, peerPorts, olderPorts]) {
      expect(success(await createRefStore(ports).pull()).states).toEqual([]);
      expect(success(await createRefStore(ports).push()).states).toEqual([]);
      const aligned = await invokeStoreMigrate([], ports);
      expect(aligned).toMatchObject({ status: "ok", result: { refs: [] } });
    }
    const first = (await invokeStoreRemote(["--json"], { cwd: h.follower.root, ports: h.follower.ports })).result;
    expect((await invokeStoreRemote(["--json"], { cwd: sibling, ports: peerPorts })).result).toEqual(first);
    expect((await invokeStoreRemote(["--json"], { cwd: older, ports: olderPorts })).result).toEqual(first);
    expect(success(await peer.read({ reference: h.follower.unpublished })).content).toBe("Unpublished follower data.\n");
  } finally { resume(); await syncing?.catch(() => {}); }
}, 60_000);
