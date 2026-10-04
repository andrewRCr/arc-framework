/** An uncertain notes merge retains its original failure and a guarded repair route. */
import { expect, it } from "vitest";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { syncFixture, syncNotesRef } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

for (const effects of [false, true]) {
  it.each(["canceled", "output-limit", "unknown"] as const)(`retains %s merge uncertainty; effects: ${effects}`, async (kind) => {
    const h = await syncFixture();
    await h.b.inbox("remote contested bytes\n");
    success(await h.b.store.sync());
    await h.a.inbox("local contested bytes\n");
    const remoteBefore = (await h.remote("git", ["rev-parse", syncNotesRef])).stdout.trim();
    const actual = h.a.ports.exec, lock = h.a.ports.locks.notes;
    let holds = 0, reconciling = false;
    h.a.ports.locks.notes = async (operation) => {
      reconciling = ++holds === 2;
      try { return await lock(operation); } finally { reconciling = false; }
    };
    let original: Error | undefined, anchor: string | undefined;
    h.a.ports.exec = async (command, args, options) => {
      if (reconciling && args[0] === "notes" && args.includes("cat_sort_uniq")) {
        anchor = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim();
        if (effects) await actual(command, args, options);
        const stderr = "notes merge completion was not observed";
        original = kind === "unknown" ? new Error(stderr) : new GitProcessError({
          kind, command, args, stderr, exitCode: 1,
          ...(kind === "canceled" ? { isCanceled: true } : { isMaxBuffer: true }),
        });
        throw original;
      }
      return actual(command, args, options);
    };
    let failure: unknown;
    try { await h.a.store.sync(); } catch (error) { failure = error; }
    expect(original).toBeDefined();
    expect(anchor).toBeDefined();
    expect(failure).toMatchObject({ code: "store.sync-failed", cause: {
      cause: original, message: expect.stringContaining(anchor!),
    } });
    expect(((failure as Error).cause as Error).cause).toBe(original);
    expect((failure as Error).cause).toHaveProperty("message", expect.stringContaining("Before retry"));
    expect((failure as Error).cause).toHaveProperty("message", expect.stringContaining("Nothing was pushed"));
    expect((await h.remote("git", ["rev-parse", syncNotesRef])).stdout.trim()).toBe(remoteBefore);
    h.a.ports.exec = actual;
    h.a.ports.locks.notes = lock;
    const current = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim();
    if (effects) expect(current).not.toBe(anchor);
    else expect(current).toBe(anchor);
    // Preserve both observed tips before following the returned expected-old repair instruction.
    await h.a.exec("git", ["update-ref", "refs/arc/test/pre-merge-notes", anchor!]);
    await h.a.exec("git", ["update-ref", "refs/arc/test/uncertain-notes", current]);
    await h.a.exec("git", ["update-ref", syncNotesRef, anchor!, current]);
    expect((await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim()).toBe(anchor);
    // Reconcile the contested bytes explicitly over the preserved remote lineage, then publish normally.
    await h.a.exec("git", ["fetch", "origin", `${syncNotesRef}:refs/arc/test/remote-notes`]);
    await h.a.exec("git", ["update-ref", syncNotesRef, remoteBefore, anchor!]);
    await h.a.inbox("combined local and remote contested bytes\n");
    expect(success(await h.a.store.sync()).publishes[0]?.status).toBe("pushed");
    const published = await h.remote("git", ["notes", "--ref", syncNotesRef, "show", "HEAD"]);
    expect(published.stdout).toContain("combined local and remote contested bytes");
  });
}

it("keeps completed nonzero merge failures as conflicts with both notes tips preserved", async () => {
  const h = await syncFixture();
  await h.b.inbox("remote bytes\n");
  success(await h.b.store.sync());
  await h.a.inbox("local bytes\n");
  const actual = h.a.ports.exec;
  let anchor: string | undefined;
  const remoteBefore = (await h.remote("git", ["rev-parse", syncNotesRef])).stdout.trim();
  h.a.ports.exec = async (command, args, options) => {
    if (args[0] === "notes" && args.includes("cat_sort_uniq")) {
      anchor = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim();
      throw new GitProcessError({ kind: "nonzero-exit", command, args, exitCode: 1, stderr: "merge rejected" });
    }
    return actual(command, args, options);
  };
  const result = success(await h.a.store.sync());
  expect(result.publishes[0]).toMatchObject({ status: "conflict", condition: expect.stringContaining("merge rejected") });
  expect(anchor).toBeDefined();
  expect((await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim()).toBe(anchor);
  expect((await h.remote("git", ["rev-parse", syncNotesRef])).stdout.trim()).toBe(remoteBefore);
});
