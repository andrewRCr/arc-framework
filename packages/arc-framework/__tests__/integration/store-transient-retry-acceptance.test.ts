/** Bounded identity retries distinguish incomplete processes from accepted pending writes. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { ArcError } from "../../src/lib/kernel/errors.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { BatchInputSchema } from "../../src/lib/store/write.js";
import { syncFixture, syncErrandRef, syncErrand, syncPut, syncRecord } from "../helpers/store/sync-fixture.js";
import { makeGitExecInput } from "../helpers/integration.js";
import { success } from "../helpers/store/suite-tools.js";

function namedPut(name: string) {
  const slug = SlugSchema.parse(name);
  return { ...syncPut(slug), reference: recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })),
    content: serializeTransientIdentityRecord({ ...syncRecord(slug), slug, branch: `chore/${slug}` }) };
}

describe.each(["write", "push"] as const)("incomplete identity %s", (stage) => {
  for (const persistent of [false, true]) it.each(["canceled", "output-limit", "unknown"] as const)("preserves %s rather than retrying diagnostic text; persistent: " + persistent, async (kind) => {
    const h = await syncFixture();
    success(await h.a.store.write(syncPut()));
    const localBefore = (await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout;
    const remoteBefore = (await h.remote("git", ["rev-parse", syncErrandRef])).stdout;
    const base = h.a.ports.exec;
    let original: Error | undefined;
    h.a.ports.exec = async (command, args, options) => {
      const selected = stage === "write" ? args[0] === "update-ref" && args[1] === syncErrandRef : args[0] === "push";
      if (selected && (persistent || original === undefined)) {
        const stderr = stage === "write" ? "reference already exists; is at one but expected another" : "[rejected] non-fast-forward";
        original ??= kind === "unknown" ? new Error(stderr) : new GitProcessError({ kind, command, args, stderr,
          ...(kind === "canceled" ? { isCanceled: true } : { isMaxBuffer: true }) });
        throw original;
      }
      return base(command, args, options);
    };
    const put = namedPut("beta");
    let failure: unknown;
    try { await h.a.store.write(put); } catch (error) { failure = error; }
    expect(original).toBeDefined();
    expect(failure).toBeInstanceOf(ArcError);
    if (!(failure instanceof ArcError) || !(failure.cause instanceof Error)) throw new Error("Expected a preserved local process cause");
    expect(failure.code).toBe("store.operation-failed");
    expect(failure.cause.cause).toBe(original);
    expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(remoteBefore);
    if (stage === "write") {
      expect((await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout).toBe(localBefore);
      expect(await h.a.store.read({ reference: put.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    } else {
      expect(success(await h.a.store.read({ reference: put.reference })).content).toBe(put.content);
      expect((await h.a.exec("git", ["rev-list", "--count", `${localBefore}..${syncErrandRef}`])).stdout).toBe("1");
    }
    h.a.ports.exec = base;
    const pending = await h.a.store.read({ reference: put.reference });
    success(await h.a.store.write({ ...put, expected: pending.status === "ok" ? pending.result.version : null }));
    expect(await makeGitExecInput(h.origin)(["cat-file", "blob", `${syncErrandRef}:beta`], "")).toBe(put.content);
  });
});

it.each(["create", "update", "remove", "batch"] as const)("publishes its accepted %s after a real independent-key remote race", async (operation) => {
  const h = await syncFixture();
  const alpha = success(await h.a.store.write(syncPut()));
  const delta = success(await h.a.store.write(namedPut("delta")));
  const base = h.a.ports.exec;
  let raced = false;
  h.a.ports.exec = async (command, args, options) => {
    if (!raced && args[0] === "push") { raced = true; success(await h.b.store.write(namedPut("gamma"))); }
    return base(command, args, options);
  };
  const create = namedPut("beta"), update = syncPut("accepted", alpha.version!),
    remove = { action: "remove" as const, reference: operation === "batch" ? namedPut("delta").reference : syncErrand,
      expected: operation === "batch" ? delta.version! : alpha.version!, provenance: syncPut().provenance };
  const result = operation === "batch" ? await h.a.store.batch(BatchInputSchema.parse({
    writes: [create, update, remove].map(({ provenance, ...mutation }) => { void provenance; return mutation; }), provenance: create.provenance }))
    : await h.a.store.write(operation === "create" ? create : operation === "update" ? update : remove);
  expect(raced).toBe(true);
  expect(result.status).toBe("ok");
  const expected = operation === "create" ? ["alpha", "beta", "delta", "gamma"] : operation === "remove" ? ["delta", "gamma"]
    : operation === "batch" ? ["alpha", "beta", "gamma"] : ["alpha", "delta", "gamma"];
  expect((await h.remote("git", ["ls-tree", "--name-only", syncErrandRef])).stdout.trim().split("\n")).toEqual(expected);
  expect((await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout).toBe((await h.remote("git", ["rev-parse", syncErrandRef])).stdout);
  if (operation === "update" || operation === "batch") {
    expect(success(await h.a.store.read({ reference: syncErrand })).content).toBe(update.content);
    expect(await makeGitExecInput(h.origin)(["cat-file", "blob", `${syncErrandRef}:alpha`], "")).toBe(update.content);
  }
});
