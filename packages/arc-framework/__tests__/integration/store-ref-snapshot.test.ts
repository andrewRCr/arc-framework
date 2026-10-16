import { describe, expect, it } from "vitest";
import { updateRefTransaction } from "../../src/lib/git/ref-transaction.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef } from "../helpers/store/ref-plant.js";

const refs = Array.from({ length: 4096 }, (_, index) =>
  `refs/arc/${index < 2048 ? "work" : "cohort"}/12345678-1234-4234-8234-${index.toString(16).padStart(12, "0")}`);

// Many refs widen the files backend's publish window while every transaction still has only two namespaces.
describe.each(["files", "reftable"] as const)("concurrent state snapshots (%s)", (format) => {
  it("distinguishes one reftable iteration from the files format's tearing control", async () => {
    const f = await createRefReadFixture(format);
    const seed = await plantRef(f.root, "refs/test/seed", []);
    await updateRefTransaction(f, refs.map((ref) => ({ ref, next: seed.tip, expected: null })));
    let stop = false;
    let updates = 0;
    let notifyReady = () => {};
    const ready = new Promise<void>((resolve) => { notifyReady = resolve; });
    const writer = async () => {
      let previous = seed.tip;
      while (!stop && updates < 16384) {
        const next = (await f.exec("git", ["commit-tree", seed.tree, "-p", previous, "-m", `Advance ${updates}`])).stdout;
        const result = await updateRefTransaction(f, refs.map((ref) => ({ ref, next, expected: previous })));
        if (result.status !== "committed") throw new Error("Unexpected competing writer");
        previous = next;
        updates += 1;
        notifyReady();
      }
    };
    const writing = Promise.allSettled([writer()]);
    let snapshots = 0;
    let tears = 0;
    let partialListings = 0;
    let mixedListings = 0;
    let updatesDuringRead: number;
    let writerResult: Awaited<typeof writing>[0];
    try {
      await Promise.race([ready, writing.then(([result]) => {
        if (result.status === "rejected") throw result.reason;
        throw new Error("The writer stopped before the reader was ready");
      })]);
      const initialUpdates = updates;
      while (snapshots < 128 && (format === "reftable" || tears === 0)) {
        let output: string;
        if (format === "reftable") {
          const token = await f.store.version();
          if (token.status !== "ok") throw new Error("No saved state token");
          output = (await f.exec("git", ["ls-tree", "-r", "--format=%(objectname)", token.result])).stdout;
        } else {
          output = (await f.exec("git", ["for-each-ref", "--format=%(objectname)", "refs/arc/work/", "refs/arc/cohort/"])).stdout;
        }
        const ids = output.trim().split("\n");
        const partial = ids.length !== refs.length;
        const mixed = new Set(ids).size !== 1;
        if (partial) partialListings += 1;
        if (mixed) mixedListings += 1;
        if (partial || mixed) tears += 1;
        snapshots += 1;
      }
      updatesDuringRead = updates - initialUpdates;
    } finally {
      stop = true;
      [writerResult] = await writing;
    }
    if (writerResult.status === "rejected") throw writerResult.reason;
    const stable = (await f.exec("git", ["for-each-ref", "--format=%(objectname)", "refs/arc/work/", "refs/arc/cohort/"])).stdout.split("\n");
    expect(stable).toHaveLength(refs.length);
    expect(new Set(stable).size).toBe(1);
    console.info("Concurrent snapshot probe", { format, snapshots, updatesDuringRead, partialListings, mixedListings });
    expect(updates).toBeGreaterThan(0);
    if (format === "reftable") {
      expect(updatesDuringRead).toBeGreaterThan(0);
      expect({ snapshots, tears }).toEqual({ snapshots: 128, tears: 0 });
    } else expect(tears).toBeGreaterThan(0);
  }, 120_000);
});
