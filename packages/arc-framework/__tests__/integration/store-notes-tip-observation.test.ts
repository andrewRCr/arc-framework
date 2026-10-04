/** Notes rollback uses only established pre/post merge tips and retains uncertainty. */
import { expect, it } from "vitest";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { syncFixture, syncNotesRef } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

for (const stage of ["pre", "post", "rollback"] as const) {
  it.each(["canceled", "output-limit", "unknown", "unexpected-exit"] as const)(`retains ${stage} tip %s failure with no publication and recovers after repair`, async (kind) => {
    const h = await syncFixture();
    await h.b.inbox("remote contested bytes\n");
    success(await h.b.store.sync());
    await h.a.inbox("local contested bytes\n");
    const remoteBefore = (await h.remote("git", ["rev-parse", syncNotesRef])).stdout;
    const actual = h.a.ports.exec, lock = h.a.ports.locks.notes;
    let lockCount = 0, reconciling = false, merged = false;
    h.a.ports.locks.notes = async (operation) => {
      reconciling = ++lockCount === 2;
      try { return await lock(operation); } finally { reconciling = false; }
    };
    let original: Error | undefined;
    let preMerge: string | undefined;
    const calls: string[][] = [];
    h.a.ports.exec = async (command, args, options) => {
      calls.push(args);
      if (reconciling && args[0] === "rev-parse" && args.at(-1) === syncNotesRef && !merged)
        preMerge = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim();
      const capture = args[0] === "rev-parse" && args.at(-1) === syncNotesRef && merged === (stage === "post");
      const rollback = args[0] === "update-ref" && args[1] === syncNotesRef;
      if (reconciling && original === undefined && (stage === "rollback" ? rollback : capture)) {
        const stderr = "fatal: bad revision notes-tip";
        original = kind === "unknown" ? new Error(stderr) : new GitProcessError({
          kind: kind === "unexpected-exit" ? "nonzero-exit" : kind, command, args, stderr,
          ...(kind === "unexpected-exit" ? { exitCode: 128 } : { exitCode: 1 }),
          ...(kind === "canceled" ? { isCanceled: true } : kind === "output-limit" ? { isMaxBuffer: true } : {}),
        });
        throw original;
      }
      const result = await actual(command, args, options);
      if (reconciling && args[0] === "notes" && args.includes("cat_sort_uniq")) merged = true;
      return result;
    };
    let failure: unknown;
    try { await h.a.store.sync(); } catch (error) { failure = error; }
    expect(original).toBeDefined();
    expect(preMerge).toBeDefined();
    if (stage === "pre") {
      expect(failure).toMatchObject({ code: "store.sync-failed", cause: original });
      expect(merged).toBe(false);
      expect((await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim()).toBe(preMerge);
    } else {
      expect(failure).toMatchObject({ code: "store.sync-failed", cause: { cause: original,
        message: expect.stringContaining(preMerge!) } });
      expect((failure as Error).cause).toHaveProperty("message", expect.stringContaining("Before retry"));
      expect((failure as Error).cause).toHaveProperty("message", expect.not.stringContaining("Your local notes are preserved"));
      expect(merged).toBe(true);
    }
    expect(calls.some((args) => args[0] === "update-ref" && args[1] === "-d" && args[2] === syncNotesRef)).toBe(false);
    expect(calls.some((args) => args[0] === "push")).toBe(false);
    expect((await h.remote("git", ["rev-parse", syncNotesRef])).stdout).toBe(remoteBefore);
    h.a.ports.exec = actual;
    h.a.ports.locks.notes = lock;
    const current = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim();
    await h.a.exec("git", ["update-ref", "refs/arc/test/original-notes", preMerge!]);
    if (stage !== "pre") await h.a.exec("git", ["update-ref", syncNotesRef, preMerge!, current]);
    // Repair explicitly while preserving the original anchor, then save combined bytes over the remote lineage.
    await h.a.exec("git", ["fetch", "origin", `${syncNotesRef}:refs/arc/test/remote-notes`]);
    await h.a.exec("git", ["update-ref", syncNotesRef, remoteBefore.trim(), preMerge!]);
    await h.a.inbox("combined local and remote contested bytes\n");
    expect(success(await h.a.store.sync()).publishes[0]?.status).toBe("pushed");
  });
}

it.each(["pre", "post"] as const)("distinguishes certified %s absence during notes reconciliation", async (stage) => {
  const h = await syncFixture();
  await h.b.inbox("remote bytes\n");
  success(await h.b.store.sync());
  await h.a.inbox("local bytes\n");
  const exec = h.a.ports.exec, lock = h.a.ports.locks.notes;
  let holds = 0, reconciling = false, merged = false, removed = false;
  let anchor: string | undefined;
  h.a.ports.locks.notes = async (operation) => {
    reconciling = ++holds === 2;
    try { return await lock(operation); } finally { reconciling = false; }
  };
  h.a.ports.exec = async (command, args, options) => {
    if (reconciling && args[0] === "rev-parse" && args.at(-1) === syncNotesRef) {
      if (!merged) anchor = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim();
      if (!removed && merged === (stage === "post")) {
        const current = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim();
        await h.a.exec("git", ["update-ref", "refs/arc/test/pre-absence", anchor!]);
        await h.a.exec("git", ["update-ref", "-d", syncNotesRef, current]);
        removed = true;
      }
    }
    const result = await exec(command, args, options);
    if (reconciling && args[0] === "notes" && args.includes("cat_sort_uniq")) merged = true;
    return result;
  };
  if (stage === "pre") expect(success(await h.a.store.sync()).publishes[0]?.status).toBe("noop");
  else await expect(h.a.store.sync()).rejects.toMatchObject({ code: "store.sync-failed",
    cause: { message: expect.stringContaining("Before retry") } });
  expect(removed).toBe(true);
  expect(anchor).toBeDefined();
  h.a.ports.exec = exec;
  h.a.ports.locks.notes = lock;
});
