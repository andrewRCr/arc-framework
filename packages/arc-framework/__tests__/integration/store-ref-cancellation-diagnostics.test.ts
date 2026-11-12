/** Sync failures preserve original cancellation evidence through local cleanup and application. */
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";
import { unconfirmedCancellation } from "../helpers/store/unconfirmed-cancellation.js";

const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "cancel.md" });
const state = "refs/arc/user/andrew/personal";

describe.each(["default", "separate"] as const)("cancellation diagnostics in %s", layout => {
  it.each(["fetch", "merge"] as const)("preserves a %s cancellation and retries after a fresh deadline", async phase => {
    const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
    const made = success(await h.a.store.write({ action: "put", reference, expected: null, content: "Original.\n", provenance: testProvenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference, expected: made.version!, content: "Updated.\n", provenance: testProvenance }));
    success(await h.a.store.push());
    let armed = true, fetched = false;
    const cancel = (args: readonly string[]) => { armed = false; clock.advance(120_000); throw unconfirmedCancellation(args, `Original ${phase} cancellation.`); };
    const store = createRefStore({ ...h.b.ports, ...clock, exec: async (command, args, options) => {
      if (armed && phase === "fetch" && args.includes("fetch")) cancel(args);
      const result = await h.b.ports.exec(command, args, options);
      if (args.includes("fetch")) fetched = true;
      return result;
    }, execInput: (args, input, options) => {
      if (armed && phase === "merge" && fetched && args.includes("update-ref") && input.includes(`update ${state} `)) cancel(args);
      return h.b.ports.execInput(args, input, options);
    } });
    const failure = success(await store.pull()).pulls.find(outcome => outcome.status === "failed");
    expect(failure).toMatchObject({ status: "failed", failure: { code: "unreachable", cause: "timeout",
      condition: expect.stringContaining("descendant processes not confirmed ended") } });
    if (failure?.status !== "failed") throw new Error("Expected canceled pull");
    expect(failure.failure.condition).toContain(`Original ${phase} cancellation.`);
    expect(success(await h.b.store.read({ reference })).content).toBe("Original.\n");
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", `refs/arc/tmp/seen/${h.remoteName}/user/andrew/personal`])).stdout).toBe("");
    success(await store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe("Updated.\n");
    const localFailure = new Error("Unrelated local tracking read failure");
    let fetchedAgain = false;
    const unrelated = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      if (fetchedAgain && args.includes("for-each-ref")) throw localFailure;
      const result = await h.b.ports.exec(command, args, options);
      if (args.includes("fetch")) fetchedAgain = true;
      return result;
    } });
    await expect(unrelated.pull()).rejects.toBe(localFailure);
  });
});
