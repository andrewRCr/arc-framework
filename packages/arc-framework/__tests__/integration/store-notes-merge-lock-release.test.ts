/** Uncertain notes merges retain recovery evidence when either lock interface fails to release. */
import { unlink } from "node:fs/promises";
import { expect, it } from "vitest";
import { acquireAdvisoryLock, releaseAdvisoryLock, withAdvisoryLock } from "../../src/lib/advisory-lock.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { reconcileNotesPush } from "../../src/commands/user/push-fetch.js";
import { runUserSave } from "../../src/commands/user/save-load.js";
import { makeUserIO } from "../helpers/integration.js";
import { syncFixture, syncNotesRef } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

for (const mode of ["callback", "provider"] as const) {
  for (const effects of [false, true]) {
    it.each(["canceled", "output-limit", "unknown"] as const)(
      `${mode} locking retains %s merge and release failures; effects: ${effects}`, async (kind) => {
        const h = await syncFixture();
        await h.b.inbox("remote contested bytes\n");
        success(await h.b.store.sync());
        await h.a.inbox("local contested bytes\n");
        const remoteBefore = (await h.remote("git", ["rev-parse", syncNotesRef])).stdout.trim();
        const actual = h.a.ports.exec;
        let anchor: string | undefined, original: Error | undefined;
        let secondary: Awaited<ReturnType<typeof acquireAdvisoryLock>> | undefined;
        h.a.ports.exec = async (command, args, options) => {
          if (args[0] === "notes" && args.includes("cat_sort_uniq")) {
            anchor = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim();
            if (effects) await actual(command, args, options);
            secondary = await acquireAdvisoryLock(`${h.a.lockPath}.break`, { maxWaitMs: 100 });
            const stderr = "notes merge completion was not observed";
            original = kind === "unknown" ? new Error(stderr) : new GitProcessError({
              kind, command, args, stderr, exitCode: 1,
              ...(kind === "canceled" ? { isCanceled: true } : { isMaxBuffer: true }),
            });
            throw original;
          }
          return actual(command, args, options);
        };
        let returned: Error | undefined;
        if (mode === "callback") {
          h.a.ports.locks.notes = (operation) => withAdvisoryLock(h.a.lockPath, operation, { maxWaitMs: 100 });
          try { await h.a.store.sync(); } catch (error) {
            expect(error).toMatchObject({ code: "store.sync-failed" });
            returned = (error as Error).cause as Error;
          }
        } else {
          const io = { ...makeUserIO(h.a.root), exec: h.a.ports.exec };
          await runUserSave({ cwd: h.a.root, io, identity: "andrew", withNotesLock: h.a.ports.locks.notes });
          const result = await reconcileNotesPush({ cwd: h.a.root, identity: "andrew", io,
            lock: { acquire: () => acquireAdvisoryLock(h.a.lockPath, { maxWaitMs: 100 }),
              release: (handle) => releaseAdvisoryLock(handle, { maxWaitMs: 100 }) } });
          expect(result.kind).toBe("failed");
          if (result.kind === "failed") returned = result.error;
        }
        const current = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim();
        if (effects) expect(current).not.toBe(anchor);
        else expect(current).toBe(anchor);
        expect((await h.remote("git", ["rev-parse", syncNotesRef])).stdout.trim()).toBe(remoteBefore);
        expect(secondary).toBeDefined();
        await releaseAdvisoryLock(secondary!, { maxWaitMs: 100 });
        await unlink(h.a.lockPath);
        expect(returned).toBeInstanceOf(AggregateError);
        expect(returned?.message).toContain(anchor!);
        expect(returned?.message).toContain("Before retry");
        expect(returned?.message).toContain("Nothing was pushed");
        const aggregate = returned as AggregateError;
        expect((aggregate.cause as Error).cause).toBe(original);
        expect(aggregate.errors).toHaveLength(2);
        expect(aggregate.errors[0]).toBe(aggregate.cause);
        expect(aggregate.errors[1]).toHaveProperty("name", "AdvisoryLockTimeoutError");
        h.a.ports.exec = actual;
        // Retain both observed tips and restore only the exact current canonical value.
        await h.a.exec("git", ["update-ref", "refs/arc/test/retained-pre-merge", anchor!]);
        await h.a.exec("git", ["update-ref", "refs/arc/test/retained-uncertain", current]);
        await h.a.exec("git", ["update-ref", syncNotesRef, anchor!, current]);
        expect((await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout.trim()).toBe(anchor);
        // Publish explicitly combined bytes over the retained remote lineage after guarded repair.
        await h.a.exec("git", ["fetch", "origin", `${syncNotesRef}:refs/arc/test/retained-remote`]);
        await h.a.exec("git", ["update-ref", syncNotesRef, remoteBefore, anchor!]);
        await h.a.inbox("combined local and remote contested bytes\n");
        expect(success(await h.a.store.sync()).publishes[0]?.status).toBe("pushed");
        expect((await h.remote("git", ["notes", "--ref", syncNotesRef, "show", "HEAD"])).stdout)
          .toContain("combined local and remote contested bytes");
      },
    );
  }
}
