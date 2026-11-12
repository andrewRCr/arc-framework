import { describe, expect, it } from "vitest";
import { refCarryFixture, carriedBranch, carriedDocument } from "../helpers/store/ref-carry.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, PushResultSchema } from "../../src/lib/store/index.js";

describe.each(["ordered", "atomic fallback", "combined refusal"] as const)("fresh designation after %s", (route) => {
  it.each(["read", "off"] as const)("retains the code result and leaves state local after becoming %s", async (role) => {
    const h = await refCarryFixture(route === "ordered" ? "separate" : "default");
    if (route === "atomic fallback") await h.remote("git", ["config", "receive.advertiseAtomic", "false"]);
    if (route === "combined refusal") {
      await h.a.exec("git", ["push", "origin", `${carriedBranch}:${carriedBranch}`]);
      await plantRef(h.a.root, carriedBranch, [{ path: "rewritten.txt", content: "Independent code history.\n" }]);
    }
    let armed = true, changed = false;
    const publisher = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      const push = args.includes("push"), state = args.some(arg => arg.includes(":refs/arc/"));
      const interrupt = armed && push && (route === "combined refusal" ? state : !state);
      try { return await h.a.ports.exec(command, args, options); }
      finally {
        if (interrupt) {
          armed = false;
          await h.a.git(["config", `remote.${h.remoteName}.arc-state`, role]);
          changed = true;
        }
      }
    } });
    const result = PushResultSchema.parse(success(await publisher.push({ carry: { ref: carriedBranch } })));
    expect(changed).toBe(true);
    expect(result.carry).toMatchObject({ ref: carriedBranch, status: route === "combined refusal" ? "refused" : "pushed" });
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    expect(result.publishes).toEqual([]);
    expect(success(await h.a.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
    await h.a.git(["config", `remote.${h.remoteName}.arc-state`, "push"]);
    success(await h.a.store.push());
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Carried state.\n");
  });
});
