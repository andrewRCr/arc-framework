/** Captured identity commits must be enumerated successfully before reconciliation. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { recordReferences, OwnerIdentitySchema } from "../../src/lib/store/index.js";
import { serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { syncFixture, syncErrandRef, syncPut, syncRecord } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

function namedPut(name: string) {
  const slug = SlugSchema.parse(name);
  return { ...syncPut(), reference: recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })),
    content: serializeTransientIdentityRecord({ ...syncRecord(slug), slug, branch: `chore/${slug}` }) };
}

describe.each(["local", "incoming"] as const)("captured %s tree", (side) => {
  it.each(["canceled", "output-limit", "unknown"] as const)("preserves %s failure and every pending record, then resumes after repair", async (kind) => {
    const h = await syncFixture();
    success(await h.a.store.write(syncPut()));
    const remote = h.a.ports.remote;
    h.a.ports.remote = async () => null;
    success(await h.a.store.write(namedPut("beta")));
    h.a.ports.remote = remote;
    success(await h.b.store.write(namedPut("gamma")));
    const localBefore = (await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout.trim();
    const remoteBefore = (await h.remote("git", ["rev-parse", syncErrandRef])).stdout.trim();
    const base = h.a.ports.exec;
    let original: Error | undefined;
    h.a.ports.exec = async (command, args, options) => {
      if (args[0] === "ls-tree" && args.at(-1) === (side === "local" ? localBefore : remoteBefore)) {
        const stderr = "fatal: Not a valid object name captured-commit";
        original ??= kind === "unknown" ? new Error(stderr) : new GitProcessError({ kind, command, args, stderr,
          ...(kind === "canceled" ? { isCanceled: true } : { isMaxBuffer: true }) });
        throw original;
      }
      return base(command, args, options);
    };
    let failure: unknown;
    try { await h.a.store.sync(); } catch (error) { failure = error; }
    expect(original).toBeDefined();
    expect(failure).toMatchObject({ code: "store.sync-failed", cause: original });
    expect((await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout.trim()).toBe(localBefore);
    expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout.trim()).toBe(remoteBefore);
    h.a.ports.exec = base;
    expect(success(await h.a.store.sync()).publishes[1]?.status).toBe("reconciled");
    expect((await h.remote("git", ["ls-tree", "--name-only", syncErrandRef])).stdout.trim().split("\n"))
      .toEqual(["alpha", "beta", "gamma"]);
  });
});
