/** Publication failures preserve local causes rather than inventing remote refusals. */
import { expect, it, onTestFinished } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { setupMultiClone } from "../helpers/multi-clone.js";
import { makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
import { errandsRef, hashBlob, readRefTip, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import { readTransientIdentitySnapshotAtRef } from "../../src/lib/errand/identity-snapshot.js";

const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" }));
const content = serializeTransientIdentityRecord(TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", slug: "alpha", claimId: "a".repeat(32), purpose: "errand", origin: "description", originEntry: null, intent: "alpha", branch: "chore/alpha", state: "open", savedHead: null, changeRequest: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" }));
const localKinds = ["unexpected", "spawn-failure", "canceled", "output-limit"] as const;
const cases = (["fetch", "push"] as const).flatMap((stage) => (["plain-error", "absent-looking-guard", "signal", ...localKinds] as const).map((kind) => ({ stage, kind })));

it.each(cases)("throws the original $kind cause from $stage instead of a remote refusal", async ({ stage, kind }) => {
  const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
  const exec = makeGitExec(clones.cloneA);
  const ports = testStorePorts(clones.cloneA, exec, makeGitExecInput(clones.cloneA));
  ports.identity = async () => SlugSchema.parse("andrew"); ports.remote = async () => "origin";
  const original = kind === "plain-error" ? new Error("Could not read from remote: local invocation guard rejected")
    : kind === "absent-looking-guard" ? new Error("Local guard: cannot find remote ref authority")
    : kind === "signal" ? new GitProcessError({ kind: "nonzero-exit", command: "git", args: [stage, "origin"], signal: "SIGTERM", stderr: "Could not read from remote: process was terminated" })
    : new GitProcessError({ kind, command: "git", args: [stage, "origin"], stderr: "Could not read from remote: local failure", isCanceled: kind === "canceled", isMaxBuffer: kind === "output-limit" });
  ports.exec = async (command, args, options) => { if (args[0] === stage) throw original; return exec(command, args, options); };
  await expect(createStore(ports).write({ action: "put", reference, content, expected: null, placement: { kind: "active" }, provenance: { verb: "arc errand", lifecycleAction: "create" } })).rejects.toMatchObject({ code: "store.operation-failed", cause: { cause: original } });
});

it("names every actual invalid key without implying the unrelated requested entry is corrupt", async () => {
  const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
  const io = { identity: "andrew", exec: makeGitExec(clones.cloneA), execInput: makeGitExecInput(clones.cloneA) };
  const objects = new Map<string, string>();
  for (const key of ["alpha", "groom-routing"]) objects.set(key, await hashBlob(io.execInput, "broken machine JSON"));
  const tip = await writeTreeCommit(io, objects, "Plant invalid entries", [], null);
  const ports = testStorePorts(clones.cloneA, io.exec, io.execInput); ports.identity = async () => SlugSchema.parse("andrew");
  const store = createStore(ports);
  const betaReference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" }));
  const betaContent = content.replaceAll('"alpha"', '"beta"').replace('"chore/alpha"', '"chore/beta"');
  const input = { action: "put" as const, reference: betaReference, content: betaContent, expected: null, placement: { kind: "active" as const }, provenance: { verb: "arc errand", lifecycleAction: "create" } };
  expect(await store.write(input)).toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference: betaReference,
    condition: "Identity basis contains invalid entries: alpha, groom-routing. Requested beta write cannot proceed.",
    rule: "Identity basis contains invalid entries: alpha, groom-routing", remedy: { text: expect.stringContaining("alpha, groom-routing") } } });
  expect(await readRefTip(io.exec, errandsRef(io.identity))).toBe(tip);
  const repaired = new Map([["alpha", await hashBlob(io.execInput, content)]]);
  await writeTreeCommit(io, repaired, "Hand repair authority", [tip], tip);
  expect((await store.write(input)).status).toBe("ok");
});

it.each(["fetch", "push"])("classifies an actual %s timeout as unreachable with its timeout reason", async (stage) => {
  const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
  const exec = makeGitExec(clones.cloneA);
  const ports = testStorePorts(clones.cloneA, exec, makeGitExecInput(clones.cloneA));
  ports.identity = async () => SlugSchema.parse("andrew"); ports.remote = async () => "origin";
  ports.exec = async (command, args, options) => { if (args[0] === stage) throw new GitProcessError({ kind: "timed-out", timedOut: true, command, args, stderr: "Git operation timed out" }); return exec(command, args, options); };
  expect(await createStore(ports).write({ action: "put", reference, content, expected: null, placement: { kind: "active" }, provenance: { verb: "arc errand", lifecycleAction: "create" } })).toMatchObject({ status: "refused", refusal: { code: "unreachable", cause: "timeout" } });
});

const lookupFailures = (["show-ref", "rev-parse"] as const).flatMap((stage) =>
  (["plain-error", "canceled", "unexpected", "spawn-failure", "nonzero-exit"] as const).map((kind) => ({ stage, kind })));

it.each(lookupFailures)("preserves an absent-looking $kind at $stage and reads after repair", async ({ stage, kind }) => {
  const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
  const exec = makeGitExec(clones.cloneA);
  const execInput = makeGitExecInput(clones.cloneA);
  const io = { identity: "andrew", exec, execInput };
  const oid = await hashBlob(execInput, content);
  await writeTreeCommit(io, new Map([["alpha", oid]]), "Create identity", [], null);
  const ports = testStorePorts(clones.cloneA, exec, execInput);
  ports.identity = async () => SlugSchema.parse("andrew");
  const args = stage === "show-ref" ? [stage, "--exists", errandsRef(io.identity)]
    : [stage, "--verify", "--end-of-options", `${errandsRef(io.identity)}^{commit}`];
  const original = kind === "plain-error" ? new Error("Needed a single revision")
    : new GitProcessError({ kind, command: "git", args,
      ...(kind === "nonzero-exit" ? { exitCode: stage === "show-ref" ? 1 : 2 } : {}),
      stderr: "Needed a single revision", isCanceled: kind === "canceled" });
  let fail = true;
  ports.exec = async (command, requested, options) => {
    if (fail && requested[0] === stage) throw original;
    return exec(command, requested, options);
  };
  const store = createStore(ports);
  await expect(store.read({ reference })).rejects.toMatchObject({ code: "store.operation-failed", cause: { cause: original } });
  expect(await store.list({ family: "work-item", kind: "work-item/record" })).toMatchObject({ status: "ok", result: { status: "unreadable" } });
  await expect(store.history({ reference })).rejects.toMatchObject({ code: "store.operation-failed", cause: { cause: original } });
  fail = false;
  expect(await store.read({ reference })).toMatchObject({ status: "ok", result: { content } });
  expect(await store.list({ family: "work-item", kind: "work-item/record" })).toMatchObject({ status: "ok", result: { status: "complete", records: [{ content }] } });
  expect(await store.history({ reference })).toMatchObject({ status: "ok", result: [{ content }] });
});

it("keeps clean named absence distinct from invalid objects and immutable snapshot failures", async () => {
  const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
  const exec = makeGitExec(clones.cloneA);
  const execInput = makeGitExecInput(clones.cloneA);
  const io = { identity: "andrew", exec, execInput };
  const ref = errandsRef(io.identity);
  expect(await readTransientIdentitySnapshotAtRef(io, ref)).toEqual({ kind: "absent" });
  const blob = await hashBlob(execInput, content);
  await exec("git", ["update-ref", ref, blob]);
  expect(await readTransientIdentitySnapshotAtRef(io, ref)).toMatchObject({ kind: "error", stage: "tip" });
  await exec("git", ["update-ref", "-d", ref]);
  await exec("git", ["symbolic-ref", ref, "refs/arc/missing-target"]);
  expect(await readTransientIdentitySnapshotAtRef(io, ref)).toMatchObject({ kind: "error", stage: "tip" });
  await exec("git", ["symbolic-ref", "--delete", ref]);
  const tip = await writeTreeCommit(io, new Map([["alpha", blob]]), "Repair identity", [], null);
  expect(await readTransientIdentitySnapshotAtRef(io, ref)).toMatchObject({ kind: "complete", tip });
  expect(await readTransientIdentitySnapshotAtRef(io, tip)).toMatchObject({ kind: "complete", tip });
  expect(await readTransientIdentitySnapshotAtRef(io, "e".repeat(40))).toMatchObject({ kind: "error", stage: "tip" });
});
