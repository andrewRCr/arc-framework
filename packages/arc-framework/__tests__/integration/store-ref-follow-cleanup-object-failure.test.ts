import { expect, it } from "vitest";

import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["code", "backing"] as const)("preserves a missing cleanup identity and its move record when following from %s", async source => {
  const h = await followFixture(undefined, source), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.switched") throw new Error("Pause before cleanup"); },
  } })).rejects.toThrow("Pause before cleanup");
  const move = "refs/arc/tmp/migrate/move";
  const moveTip = (await follower.exec("git", ["rev-parse", move])).stdout.trim();
  const oid = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", "refs/arc/project/registry:identity.json"])).stdout.trim();
  const bytes = (await follower.ports.rawExec(["cat-file", "blob", oid])).stdout;
  const originRefs = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const destinationRefs = async () => (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const destinationBefore = await destinationRefs();
  let armed = false, removed = false;
  const ports = { ...follower.ports,
    migrateStep: async (step: string) => { if (!removed && step === "follow.read-destination") armed = true; },
    exec: async (...args: Parameters<typeof follower.ports.exec>) => {
      const result = await follower.ports.exec(...args);
      if (armed && !removed && args[1].includes("fetch") && args[1].includes(h.destinationDirectory)
        && args[2]?.input?.includes(":refs/arc/tmp/migrate/remote/")) {
        armed = false; removed = true;
        await removeLooseObject(follower.root, oid);
      }
      return result;
    },
  };
  const refused = await invokeStoreMigrate([], ports);
  expect(removed).toBe(true);
  await expect(follower.exec("git", ["cat-file", "-e", oid])).rejects.toBeDefined();
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [], condition: expect.stringContaining(oid),
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } } });
  expect((await follower.exec("git", ["rev-parse", move])).stdout.trim()).toBe(moveTip);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(originRefs);
  expect(await destinationRefs()).toBe(destinationBefore);
  const restored = await follower.ports.rawExec(["hash-object", "-t", "blob", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  expect((await invokeStoreMigrate([], ports)).status).toBe("ok");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", move])).stdout).toBe("");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);
