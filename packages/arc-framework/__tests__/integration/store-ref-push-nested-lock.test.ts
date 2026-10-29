/** A nested state pull retains the enclosing publication's recovery route. */
import { expect, it } from "vitest";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

it.each([["default", 0], ["separate", 0], ["default", 1], ["separate", 1]] as const)("retries the push after a nested keeper wait (%s, clock tick %s)", async (layout, tick) => {
  const h = await refSyncFixture(layout);
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "local.md", owner: { type: "person", name: "andrew" } });
  success(await h.b.store.write({ action: "put", reference, expected: null, content: "Unpublished value.\n",
    provenance: { verb: "save", lifecycleAction: "save" } }));
  const keeper = `refs/arc/tmp/seen/${h.remoteName}`;
  const release = await h.b.ports.lock(keeper);
  const store = createRefStore({ ...h.b.ports, ...createRefClock(new Date(0), tick), lock: (ref, waitMs) => h.b.ports.lock(ref, ref === keeper ? 1 : waitMs) });
  const before = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  try {
    const result = await store.push();
    let remedy: string;
    if (tick) {
      const failed = success(result).publishes.find(outcome => outcome.status === "failed");
      expect(failed).toMatchObject({ status: "failed", failure: { code: "unreachable", cause: "timeout" } });
      if (failed?.status !== "failed") throw new Error("Expected deadline publication failure");
      remedy = failed.failure.remedy.text;
    } else {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "lock-held", class: "recoverable" } });
      if (result.status !== "refused") throw new Error("Expected held-lock refusal");
      remedy = result.refusal.remedy.text;
    }
    expect(remedy).toMatch(/retry the push/iu);
    expect(remedy).not.toMatch(/retry the pull/iu);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
  } finally { await release(); }
  const pushed = success(await store.push());
  expect(pushed.publishes.every(({ status }) => status !== "failed")).toBe(true);
  success(await h.a.store.pull());
  expect(success(await h.a.store.read({ reference })).content).toBe("Unpublished value.\n");
});
