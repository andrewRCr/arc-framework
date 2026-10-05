/** Incomplete notes pushes never authorize reconciliation from diagnostic text. */
import { expect, it } from "vitest";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { syncFixture, syncNotesRef } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["canceled", "output-limit", "unknown"] as const)("preserves an incomplete %s notes push and retries after repair", async (kind) => {
  const h = await syncFixture();
  await h.a.inbox("pending personal bytes\n");
  const before = await h.a.exec("git", ["ls-remote", "origin", syncNotesRef]);
  const actual = h.a.ports.exec;
  let original: Error | undefined;
  let localTip: string | undefined;
  const afterFailure: string[][] = [];
  h.a.ports.exec = async (command, args, options) => {
    if (original !== undefined) afterFailure.push(args);
    if (original === undefined && args[0] === "push" && args.some((arg) => arg.endsWith(`:${syncNotesRef}`))) {
      const stderr = "[rejected] non-fast-forward";
      localTip = (await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout;
      original = kind === "unknown" ? new Error(stderr) : new GitProcessError({ kind, command, args, stderr,
        ...(kind === "canceled" ? { isCanceled: true } : { isMaxBuffer: true }) });
      throw original;
    }
    return actual(command, args, options);
  };
  let failure: unknown;
  try { await h.a.store.sync(); } catch (error) { failure = error; }
  expect(original).toBeDefined();
  expect(failure).toMatchObject({ code: "store.sync-failed", cause: original });
  expect(afterFailure.filter((args) => args[0] === "fetch" || args[0] === "push"
    || (args[0] === "notes" && args.includes("merge")))).toEqual([]);
  expect((await h.a.exec("git", ["rev-parse", syncNotesRef])).stdout).toBe(localTip);
  expect((await h.a.exec("git", ["ls-remote", "origin", syncNotesRef])).stdout).toBe(before.stdout);
  h.a.ports.exec = actual;
  expect(success(await h.a.store.sync()).publishes[0]?.status).toBe("pushed");
});
