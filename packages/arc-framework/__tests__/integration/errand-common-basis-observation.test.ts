/** Common-ancestor observations cannot resurrect accepted removals or authorize incomplete writes. */
import { expect, it, vi } from "vitest";
import { transactTransientIdentities } from "../../src/lib/errand/identity-transaction.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema, type TransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { syncFixture, syncPut, syncErrand, syncErrandRef, syncRecord, syncIdentity } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

function namedRecord(name: string): TransientIdentityRecord {
  return TransientIdentityRecordSchema.parse({ ...syncRecord(), slug: name, branch: `chore/${name}`,
    claimId: name.charCodeAt(0).toString(16).padStart(2, "0").repeat(16) });
}
function put(name: string) {
  return { ...syncPut(), reference: recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name })),
    content: serializeTransientIdentityRecord(namedRecord(name)) };
}

async function divergentRemoval() {
  const h = await syncFixture();
  const initial = success(await h.a.store.write(syncPut()));
  if (initial.version === undefined) throw new Error("Expected the accepted record version");
  const remote = h.a.ports.remote;
  h.a.ports.remote = async () => null;
  try {
    success(await h.a.store.write({ action: "remove", reference: syncErrand, expected: initial.version,
      provenance: syncPut().provenance }));
  } finally { h.a.ports.remote = remote; }
  expect(await h.a.store.read({ reference: syncErrand })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  success(await h.b.store.write(put("gamma")));
  return h;
}

for (const entry of ["producer", "write", "batch"] as const) {
  it.each(["canceled", "output-limit", "timed-out", "signaled", "unclassified", "blank", "malformed"] as const)(
    `preserves removal and authority after %s common-basis failure through ${entry}, then retries`, async (kind) => {
      const h = await divergentRemoval();
      const local = (await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout;
      const remote = (await h.remote("git", ["rev-parse", syncErrandRef])).stdout;
      const actual = h.a.ports.exec;
      let original: GitProcessError | undefined;
      let injected = false;
      const calls: string[][] = [];
      h.a.ports.exec = async (command, args, options) => {
        calls.push(args);
        if (args[0] === "merge-base") {
          injected = true;
          if (kind === "blank" || kind === "malformed") return { stdout: kind === "blank" ? "\n" : "not-an-object\n", stderr: "" };
          original = new GitProcessError({ command, args, exitCode: 1,
            kind: kind === "signaled" ? "nonzero-exit" : kind === "unclassified" ? "unexpected" : kind,
            ...(kind === "signaled" ? { signal: "SIGTERM" } : {}) });
          throw original;
        }
        return actual(command, args, options);
      };
      const transform = vi.fn((basis: ReadonlyMap<string, TransientIdentityRecord>) => ({
        kind: "applied" as const, records: new Map(basis).set("delta", namedRecord("delta")), value: "delta" }));
      const invoke = () => entry === "producer"
        ? transactTransientIdentities({ exec: h.a.ports.exec, execInput: h.a.execInput, identity: syncIdentity },
          { remote: "origin", message: "add delta", transform })
        : entry === "write" ? h.a.store.write(put("delta"))
          : h.a.store.batch({ writes: [put("delta")], provenance: syncPut().provenance });
      if (entry === "producer") {
        const outcome = await invoke();
        expect(outcome).toMatchObject({ kind: "error", stage: "basis" });
        if (original !== undefined) expect(outcome).toHaveProperty("error", original);
        expect(transform).not.toHaveBeenCalled();
      } else {
        let failure: unknown;
        try { await invoke(); } catch (error) { failure = error; }
        expect(failure).toBeInstanceOf(Error);
        expect(failure).toMatchObject({ code: "store.operation-failed" });
        if (original !== undefined) expect(((failure as Error).cause as Error).cause).toBe(original);
      }
      expect(injected).toBe(true);
      expect(calls.some((args) => args[0] === "push" || args[0] === "commit-tree"
        || (args[0] === "update-ref" && args[1] === syncErrandRef))).toBe(false);
      expect((await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout).toBe(local);
      expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(remote);
      expect(await h.a.store.read({ reference: syncErrand })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      h.a.ports.exec = actual;
      const repaired = await invoke();
      if (entry === "producer") expect(repaired).toMatchObject({ kind: "applied" });
      else expect(repaired).toMatchObject({ status: "ok" });
      expect((await h.remote("git", ["ls-tree", "--name-only", syncErrandRef])).stdout.trim().split("\n")).toEqual(["delta", "gamma"]);
      expect(await h.a.store.read({ reference: syncErrand })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    });
}

it("retains independent records when a completed merge-base establishes no common ancestor", async () => {
  const h = await syncFixture();
  const remote = h.a.ports.remote;
  h.a.ports.remote = async () => null;
  try { success(await h.a.store.write(syncPut())); } finally { h.a.ports.remote = remote; }
  success(await h.b.store.write(put("gamma")));
  const local = (await h.a.exec("git", ["rev-parse", syncErrandRef])).stdout.trim();
  const other = (await h.b.exec("git", ["rev-parse", syncErrandRef])).stdout.trim();
  await h.a.exec("git", ["fetch", "origin", `${syncErrandRef}:refs/arc/test/unrelated`]);
  await expect(h.a.exec("git", ["merge-base", local, other])).rejects.toMatchObject({ kind: "nonzero-exit", exitCode: 1 });
  success(await h.a.store.write(put("delta")));
  expect((await h.remote("git", ["ls-tree", "--name-only", syncErrandRef])).stdout.trim().split("\n")).toEqual(["alpha", "delta", "gamma"]);
});
