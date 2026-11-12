import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";

describe.each(["default", "separate"] as const)("fetched closure argument bounds in %s", layout => {
  it("acquires every tip through a constrained native argument boundary", async () => {
    const h = await refSyncFixture(layout), made = [];
    for (let i = 0; i < 8; i += 1) made.push(success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: `closure-${i}` } }),
      content: makeMetaFixture(`closure-${i}`), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } })));
    success(await h.a.store.push());
    await h.b.git(["config", `remote.${h.remoteName}.promisor`, "true"]);
    const ceiling = 256 + (h.b.gitDir?.length ?? 0);
    const admit = (args: readonly string[]): void => {
      if (args.includes("rev-list") && args.join(" ").length > ceiling) throw new GitProcessError({ command: "git", args,
        kind: "spawn-failure", cause: Object.assign(new Error("The command line exceeds the fixture's native argument ceiling."), { code: "E2BIG" }) });
    };
    const store = createRefStore({ ...h.b.ports,
      exec: (command, args, options) => { admit(args); return h.b.ports.exec(command, args, options); },
      execInput: (args, input, options) => { admit(args); return h.b.ports.execInput(args, input, options); },
    });
    const pulled = success(await store.pull());
    expect(pulled.pulls.every(({ status }) => status !== "failed"), JSON.stringify(pulled)).toBe(true);
    for (let i = 0; i < made.length; i += 1) {
      const item = made[i]; if (!item) throw new Error("Expected every created item");
      expect(success(await store.read({ reference: item.reference })).content).toBe(makeMetaFixture(`closure-${i}`));
    }
    expect(success(await store.pull()).pulls.every(({ status }) => status !== "failed")).toBe(true);
  }, 60_000);
});
