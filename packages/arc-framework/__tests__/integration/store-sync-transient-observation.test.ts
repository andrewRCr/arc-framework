/** Mutating identity sync refuses failed tip observations and retries after repair. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { recordReferences, OwnerIdentitySchema } from "../../src/lib/store/index.js";
import { serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { syncFixture, syncErrandRef, syncPut, syncRecord } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeGitExecInput } from "../helpers/integration.js";

function namedPut(name: string) {
  const slug = SlugSchema.parse(name);
  return { ...syncPut(), reference: recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })),
    content: serializeTransientIdentityRecord({ ...syncRecord(slug), slug, branch: `chore/${slug}` }) };
}

describe.each(["initial", "reconcile-local", "reconcile-incoming"] as const)("identity tip observation: %s", (stage) => {
  it.each(["canceled", "unexpected"] as const)("preserves a %s failure and the pending state, then publishes after repair", async (kind) => {
    const h = await syncFixture();
    success(await h.a.store.write(syncPut()));
    const remote = h.a.ports.remote;
    h.a.ports.remote = async () => null;
    success(await h.a.store.write(namedPut("gamma")));
    h.a.ports.remote = remote;
    if (stage !== "initial") success(await h.b.store.write(namedPut("beta")));
    const localBefore = (await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout;
    const remoteBefore = (await h.remote("git", ["rev-parse", syncErrandRef])).stdout;
    const base = h.a.ports.exec;
    let localReads = 0;
    let original: Error | undefined;
    h.a.ports.exec = async (command, args, options) => {
      if (args[0] === "rev-parse" && args.includes(syncErrandRef)) localReads++;
      const selected = args[0] === "rev-parse" && (stage === "reconcile-incoming"
        ? args.some((arg) => arg.startsWith(`${syncErrandRef}__incoming`))
        : args.includes(syncErrandRef) && localReads === (stage === "initial" ? 1 : 2));
      if (selected) {
        original = kind === "canceled" ? new GitProcessError({ kind, command, args, isCanceled: true })
          : new Error("Unclassified identity observation failure");
        throw original;
      }
      return base(command, args, options);
    };
    let failure: unknown;
    try { await h.a.store.sync(); } catch (error) { failure = error; }
    expect(original).toBeDefined();
    expect(failure).toMatchObject({ code: "store.sync-failed", cause: original });
    expect((await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout).toBe(localBefore);
    expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(remoteBefore);
    h.a.ports.exec = base;
    expect(success(await h.a.store.sync()).publishes[1]?.status).toBe(stage === "initial" ? "pushed" : "reconciled");
    expect((await h.remote("git", ["ls-tree", "--name-only", syncErrandRef])).stdout.trim().split("\n"))
      .toEqual(stage === "initial" ? ["alpha", "gamma"] : ["alpha", "beta", "gamma"]);
  });
});

it("binds replacement stdin execution to the store checkout during identity reconciliation", async () => {
  const h = await syncFixture();
  success(await h.a.store.write(syncPut()));
  const remote = h.a.ports.remote;
  h.a.ports.remote = async () => null;
  const pending = success(await h.a.store.write(namedPut("gamma")));
  h.a.ports.remote = remote;
  success(await h.b.store.write(namedPut("beta")));
  const ambientBefore = (await h.b.exec("git", ["rev-parse", syncErrandRef])).stdout;
  await expect(h.b.exec("git", ["cat-file", "-e", pending.version!])).rejects.toMatchObject({ kind: "nonzero-exit" });
  h.a.ports.execInput = makeGitExecInput(h.cloneB);
  expect(success(await h.a.store.sync()).publishes[1]?.status).toBe("reconciled");
  expect((await h.remote("git", ["ls-tree", "--name-only", syncErrandRef])).stdout.trim().split("\n"))
    .toEqual(["alpha", "beta", "gamma"]);
  expect((await h.remote("git", ["rev-parse", `${syncErrandRef}:gamma`])).stdout).toBe(pending.version);
  expect((await h.b.exec("git", ["rev-parse", syncErrandRef])).stdout).toBe(ambientBefore);
});

it.each(["canceled", "output-limit", "unknown"] as const)("sync preserves an incomplete %s push without reconciling it", async (kind) => {
  const h = await syncFixture();
  success(await h.a.store.write(syncPut()));
  const remote = h.a.ports.remote;
  h.a.ports.remote = async () => null;
  success(await h.a.store.write(namedPut("beta")));
  h.a.ports.remote = remote;
  const localBefore = (await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout;
  const remoteBefore = (await h.remote("git", ["rev-parse", syncErrandRef])).stdout;
  const base = h.a.ports.exec;
  let original: Error | undefined;
  h.a.ports.exec = async (command, args, options) => {
    if (original === undefined && args[0] === "push") {
      original = kind === "unknown" ? new Error("[rejected] non-fast-forward")
        : new GitProcessError({ kind, command, args, stderr: "[rejected] non-fast-forward",
          ...(kind === "canceled" ? { isCanceled: true } : { isMaxBuffer: true }) });
      throw original;
    }
    return base(command, args, options);
  };
  let failure: unknown;
  try { await h.a.store.sync(); } catch (error) { failure = error; }
  expect(original).toBeDefined();
  expect(failure).toMatchObject({ code: "store.sync-failed", cause: original });
  expect((await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout).toBe(localBefore);
  expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(remoteBefore);
  h.a.ports.exec = base;
  expect(success(await h.a.store.sync()).publishes[1]?.status).toBe("pushed");
  expect((await h.remote("git", ["ls-tree", "--name-only", syncErrandRef])).stdout.trim().split("\n")).toEqual(["alpha", "beta"]);
});
