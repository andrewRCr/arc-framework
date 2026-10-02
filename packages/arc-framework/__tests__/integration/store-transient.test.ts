/** Public Store behavior over the real transient identity ref. */
import { describe, expect, it, onTestFinished } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { TransientIdentityRecordSchema, serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { readTransientIdentitySnapshot } from "../../src/lib/errand/identity-snapshot.js";
import { transactTransientIdentities } from "../../src/lib/errand/identity-transaction.js";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
import { hashBlob, writeTreeCommit, readRefTip, errandsRef } from "../../src/lib/errand/ref-tree.js";
import { groomClaimTransform, housekeepClaimTransform } from "../../src/lib/errand/identity-claims.js";
import { MAX_LOCUS_JSON_BYTES } from "../../src/lib/locus/schema/index.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { setupMultiClone } from "../helpers/multi-clone.js";
import type { StoreResult } from "../../src/lib/store/refusal.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { mkdir, writeFile, unlink, rename } from "node:fs/promises";
import { join } from "node:path";

const provenance = { verb: "arc errand", lifecycleAction: "update" };
function ok<T>(value: StoreResult<T>): T { if (value.status !== "ok") throw new Error(value.refusal.condition); return value.result; }
function put(content = serializeTransientIdentityRecord(record()), expected: StoreRecord["version"] | null = null) {
  return { action: "put" as const, reference, content, expected, placement: { kind: "active" as const }, provenance };
}

const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" }));
const record = (intent = "alpha") => {
  const result = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", slug: "alpha",
  claimId: "a".repeat(32), purpose: "errand", origin: "description", originEntry: null, intent, branch: "chore/alpha",
  state: "open", savedHead: null, changeRequest: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" });
  if (result.kind !== "errand" || result.purpose !== "errand" || result.state !== "open") throw new Error("Expected ordinary open errand");
  return result;
};
async function fixture() {
  const root = await createTempRepo();
  onTestFinished(() => cleanupTempDir(root));
  const exec = makeGitExec(root);
  const execInput = makeGitExecInput(root);
  const ports = testStorePorts(root, exec, execInput);
  ports.identity = async () => SlugSchema.parse("andrew");
  return { root, ports, store: createStore(ports), io: { identity: "andrew", exec, execInput } };
}
describe("transient Store", () => {
  it("preserves absent identity snapshots in family listings", async () => {
    const h = await fixture();
    expect(await readTransientIdentitySnapshot(h.io)).toEqual({ kind: "absent" });
    expect(await h.store.list({ family: "work-item", kind: "work-item/record" })).toEqual({ status: "ok", result: { status: "absent" } });
  });
  it("reads existing producer bytes and the blob version with active placement", async () => {
    const h = await fixture();
    await transactTransientIdentities(h.io, { remote: null, message: "Create alpha", transform: () => ({ kind: "applied", records: new Map([["alpha", record()]]), value: null }) });
    const snapshot = await readTransientIdentitySnapshot(h.io);
    if (snapshot.kind !== "complete") throw new Error("Expected identity tree");
    expect(await h.store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content: serializeTransientIdentityRecord(record()), version: snapshot.objects.get("alpha"), placement: { kind: "active" } } });
  });
  it("writes producer-identical bytes, preserves history and removes on its exact version", async () => {
    const h = await fixture();
    const created = ok(await h.store.write(put()));
    const read = ok(await h.store.read({ reference }));
    expect(read.content).toBe(serializeTransientIdentityRecord(record()));
    expect(read.version).toBe(created.version);
    const changed = ok(await h.store.write(put(serializeTransientIdentityRecord(record("changed")), read.version)));
    const history = ok(await h.store.history({ reference }));
    expect(history.map((item) => item.version)).toEqual([changed.version, created.version]);
    expect(history.map((item) => item.provenance)).toEqual([{ message: "arc errand: update\n" }, { message: "arc errand: update\n" }]);
    expect(await h.store.write(put("{}", read.version))).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
    expect(await h.store.write(put(serializeTransientIdentityRecord(record()), read.version))).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [reference] } });
    ok(await h.store.write({ action: "remove", reference, expected: changed.version!, provenance }));
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(ok(await h.store.history({ reference }))[0]?.version).toBeNull();
  });
  it("separates claims by family and resolves producer claims and branch records", async () => {
    const h = await fixture();
    await h.store.write(put());
    const groom = TransientIdentityRecordSchema.parse({ version: 3, kind: "groom", slug: "groom-beta", claimId: "b".repeat(32), anchorStub: "beta", members: ["beta"], openedBaseHead: "a".repeat(40), protection: "partial", branch: null, state: "open", changeRequest: null, createdAt: record().createdAt, updatedAt: record().updatedAt });
    if (groom.kind !== "groom") throw new Error("Expected groom");
    await transactTransientIdentities(h.io, { remote: null, message: "Groom claim", transform: groomClaimTransform(groom) });
    const housekeep = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "housekeep-routing", slug: "housekeep", claimId: "c".repeat(32), branch: "chore/housekeep", state: "open", savedHead: null, changeRequest: null, createdAt: record().createdAt, updatedAt: record().updatedAt });
    if (housekeep.kind !== "errand" || housekeep.purpose !== "housekeep-routing") throw new Error("Expected housekeep");
    await transactTransientIdentities(h.io, { remote: null, message: "Housekeep claim", transform: housekeepClaimTransform(housekeep) });
    const errands = ok(await h.store.list({ family: "work-item", kind: "work-item/record" }));
    const claims = ok(await h.store.list({ family: "claims" }));
    expect(errands).toMatchObject({ status: "complete", records: [{ reference, placement: { kind: "active" } }] });
    expect(claims.status).toBe("complete");
    if (claims.status !== "complete") throw new Error("Expected claims");
    expect(claims.records.map((item) => item.reference.kind).sort()).toEqual(["claims/groom", "claims/housekeep"]);
    expect(claims.records.every((item) => item.placement === undefined)).toBe(true);
    for (const claim of [{ kind: "errand" as const, slug: SlugSchema.parse("alpha"), claimId: record().claimId }, { kind: "groom" as const, slug: groom.slug, claimId: groom.claimId }, { kind: "housekeep" as const, slug: housekeep.slug, claimId: housekeep.claimId }]) {
      const resolved = ok(await h.store.lookup({ kind: "claim", claim }));
      expect(ok(await h.store.read({ reference: resolved.reference })).fields).toMatchObject({ claimId: claim.claimId });
    }
    expect(ok(await h.store.lookup({ kind: "ref", repository: h.root, ref: "refs/heads/chore/alpha" })).reference).toEqual(reference);
    expect(await h.store.lookup({ kind: "claim", claim: { kind: "partial-errand", slug: SlugSchema.parse("alpha"), claimId: null } })).toMatchObject({ status: "refused", refusal: { code: "not-found", condition: expect.stringContaining("keeps no record") } });
  });
  it("returns malformed and unknown content bytes but refuses mismatches and oversized blobs until repaired", async () => {
    const h = await fixture();
    const plant = async (bytes: string) => {
      const oid = await hashBlob(h.io.execInput, bytes);
      const tip = await readRefTip(h.io.exec, errandsRef(h.io.identity));
      await writeTreeCommit(h.io, new Map([["alpha", oid]]), "Plant test bytes", tip === null ? [] : [tip], tip);
      return oid;
    };
    for (const bytes of ["broken-json\n", '{"version":9}\n']) {
      const oid = await plant(bytes);
      expect(ok(await h.store.read({ reference }))).toMatchObject({ content: bytes, version: oid });
      const listing = ok(await h.store.list({ family: "work-item", kind: "work-item/record" }));
      expect(listing).toMatchObject({ status: "complete", records: [], missed: true, diagnostics: [{ kind: "malformed", key: "alpha" }] });
      if (bytes.includes('"version":9')) expect(listing).toMatchObject({ diagnostics: [{ condition: "Unknown content version 9" }] });
      expect(await h.store.write(put())).toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference } });
      expect(await transactTransientIdentities(h.io, { remote: null, message: "Inspect basis", transform: () => ({ kind: "idempotent", value: null }) })).toMatchObject({ kind: "error", stage: "basis", invalidKeys: ["alpha"], message: "Identity basis contains invalid entries: alpha" });
    }
    await plant(serializeTransientIdentityRecord({ ...record(), slug: SlugSchema.parse("beta"), branch: "chore/beta" }));
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "identity-mismatch", expected: reference, actual: { owner: { name: "beta" } } } });
    await plant(" ".repeat(MAX_LOCUS_JSON_BYTES + 1));
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: expect.stringContaining(String(MAX_LOCUS_JSON_BYTES)) } });
    await plant(serializeTransientIdentityRecord(record()));
    expect(ok(await h.store.read({ reference })).fields).toEqual(record());
  });
  it("keeps root failures distinct from absence and never fetches during read or listing", async () => {
    const h = await fixture();
    ok(await h.store.write(put()));
    const original = h.ports.exec;
    h.ports.exec = async (command, args, options) => {
      if (args[0] === "fetch") throw new Error("Unexpected network read");
      return original(command, args, options);
    };
    expect(ok(await h.store.read({ reference })).content).toBe(serializeTransientIdentityRecord(record()));
    expect(ok(await h.store.list({ family: "work-item", kind: "work-item/record" })).status).toBe("complete");
    h.ports.exec = async (command, args, options) => {
      if (args[0] === "ls-tree") throw new Error("Tree unavailable");
      return original(command, args, options);
    };
    await expect(h.store.read({ reference })).rejects.toMatchObject({ code: "store.operation-failed" });
    expect(ok(await h.store.list({ family: "work-item", kind: "work-item/record" }))).toMatchObject({ status: "unreadable", condition: "Tree unavailable" });
  });
  it("refuses identity-bound operations without configuration then succeeds after configuration", async () => {
    const h = await fixture();
    ok(await h.store.write(put()));
    h.ports.identity = async () => null;
    expect(await h.store.list({ family: "claims" })).toEqual({ status: "ok", result: { status: "absent" } });
    const operations = [() => h.store.read({ reference }), () => h.store.write(put()), () => h.store.history({ reference }), () => h.store.lookup({ kind: "claim", claim: { kind: "errand", slug: SlugSchema.parse("alpha"), claimId: record().claimId } }), () => h.store.lookup({ kind: "ref", repository: h.root, ref: "chore/alpha" })];
    for (const operation of operations) expect(await operation()).toMatchObject({ status: "refused", refusal: { code: "not-found", condition: expect.stringContaining("No identity"), remedy: { text: expect.stringContaining("arc.identity") } } });
    h.ports.identity = async () => SlugSchema.parse("andrew");
    for (const operation of [operations[0]!, operations[2]!, operations[3]!, operations[4]!]) expect((await operation()).status).toBe("ok");
  });
  it("classifies exhausted CAS contention with injected elapsed time and throws a held ref lock", async () => {
    const h = await fixture();
    const original = h.ports.exec;
    let ticks = 0;
    h.ports.clock = () => new Date(ticks++ * 37);
    h.ports.exec = async (command, args, options) => {
      if (args[0] === "update-ref" && args[1] === errandsRef("andrew")) throw makeGitProcessError({ command: "git", args: [...args], stderr: "reference already exists", exitCode: 1 });
      return original(command, args, options);
    };
    expect(await h.store.write(put())).toMatchObject({ status: "refused", refusal: { code: "retries-exhausted", retryCount: 3, waitedMs: 37 } });
    expect(await transactTransientIdentities({ ...h.io, exec: h.ports.exec }, { remote: null, message: "Inspect CAS", transform: () => ({ kind: "applied", records: new Map([["alpha", record()]]), value: null }) })).toMatchObject({ kind: "error", stage: "write", retriesExhausted: true, retryCount: 3, message: "Identity transaction exceeded retry attempts" });
    h.ports.exec = original;
    const lockDir = join(h.root, ".git/refs/arc/user/andrew");
    const lock = join(lockDir, "errands.lock");
    await mkdir(lockDir, { recursive: true });
    await writeFile(lock, "Held by another writer");
    await expect(h.store.write(put())).rejects.toMatchObject({ code: "store.operation-failed" });
    await unlink(lock);
    expect((await h.store.write(put())).status).toBe("ok");
  });
  it("reconciles a remote-only change before stale refusal so reread and reapply work", async () => {
    const clones = await setupMultiClone();
    onTestFinished(clones.cleanup);
    const at = (root: string) => { const ports = testStorePorts(root, makeGitExec(root), makeGitExecInput(root)); ports.identity = async () => SlugSchema.parse("andrew"); ports.remote = async () => "origin"; return createStore(ports); };
    const a = at(clones.cloneA); const b = at(clones.cloneB);
    const first = ok(await a.write(put()));
    ok(await b.write(put(serializeTransientIdentityRecord(record("remote")), first.version!)));
    expect(ok(await a.read({ reference })).fields).toEqual(record());
    expect(await a.write(put(serializeTransientIdentityRecord(record("local")), first.version!))).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [reference] } });
    const refreshed = ok(await a.read({ reference }));
    expect(refreshed.fields).toEqual(record("remote"));
    ok(await a.write(put(serializeTransientIdentityRecord(record("local")), refreshed.version)));
    expect(ok(await a.read({ reference })).fields).toEqual(record("local"));
  });
  it("rejects unsupported placement, links and UID mutations without changing the ref", async () => {
    const h = await fixture();
    const absent = await readTransientIdentitySnapshot(h.io);
    for (const input of [{ ...put(), placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q3") } }, { ...put(), links: {} }]) {
      expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "terminal" } });
      expect(await readTransientIdentitySnapshot(h.io)).toEqual(absent);
    }
    const created = ok(await h.store.write(put()));
    const before = await readRefTip(h.io.exec, errandsRef("andrew"));
    const uidReference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha", uid: "00000000-0000-4000-8000-000000000001" }));
    for (const input of [{ ...put(serializeTransientIdentityRecord(record()), created.version!), placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q3") } }, { ...put(), reference: uidReference }, { ...put(serializeTransientIdentityRecord(record()), created.version!), links: {} }]) expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "terminal" } });
    expect(await readRefTip(h.io.exec, errandsRef("andrew"))).toBe(before);
  });
  it("validates content before fetching and leaves invalid writes repairable", async () => {
    const h = await fixture();
    h.ports.remote = async () => "origin";
    const original = h.ports.exec;
    h.ports.exec = async (command, args, options) => { if (args[0] === "fetch") throw new Error("Content validation reached remote"); return original(command, args, options); };
    for (const content of ["broken", '{"version":20}', serializeTransientIdentityRecord({ ...record(), slug: SlugSchema.parse("beta"), branch: "chore/beta" })]) expect(await h.store.write(put(content))).toMatchObject({ status: "refused", refusal: { code: content.includes('"beta"') ? "identity-mismatch" : "record-malformed" } });
    expect(await readTransientIdentitySnapshot(h.io)).toEqual({ kind: "absent" });
    h.ports.remote = async () => null;
    expect((await h.store.write(put())).status).toBe("ok");
  });
  it("applies a same-ref batch wholly and reports every stale record", async () => {
    const h = await fixture();
    const betaReference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" }));
    const betaBytes = serializeTransientIdentityRecord({ ...record(), slug: SlugSchema.parse("beta"), branch: "chore/beta" });
    const writes = [put(), { ...put(betaBytes), reference: betaReference }];
    const created = ok(await h.store.batch({ writes, provenance }));
    expect(created.writes.map((write) => write.reference)).toEqual([reference, betaReference]);
    const before = await readRefTip(h.io.exec, errandsRef("andrew"));
    expect(await h.store.batch({ writes, provenance })).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [reference, betaReference] } });
    expect(await readRefTip(h.io.exec, errandsRef("andrew"))).toBe(before);
    expect(ok(await h.store.read({ reference: betaReference })).content).toBe(betaBytes);
  });
  it("distinguishes bounded push contention from the final host rejection", async () => {
    const clones = await setupMultiClone();
    onTestFinished(clones.cleanup);
    const ports = testStorePorts(clones.cloneA, makeGitExec(clones.cloneA), makeGitExecInput(clones.cloneA));
    ports.identity = async () => SlugSchema.parse("andrew"); ports.remote = async () => "origin";
    let ticks = 0; ports.clock = () => new Date(ticks++ * 19);
    const original = ports.exec;
    let pushes = 0; let lastRejected = false;
    ports.exec = async (command, args, options) => {
      if (args[0] === "push") { pushes++; throw makeGitProcessError({ command, args: [...args], exitCode: 1, stderr: lastRejected && pushes % 3 === 0 ? "remote: policy denied this operation" : "! [rejected] non-fast-forward" }); }
      return original(command, args, options);
    };
    const store = createStore(ports);
    expect(await store.write(put())).toMatchObject({ status: "refused", refusal: { code: "retries-exhausted", retryCount: 3, waitedMs: 19 } });
    expect(pushes).toBe(3);
    lastRejected = true;
    const current = ok(await store.read({ reference }));
    expect(await store.write(put(serializeTransientIdentityRecord(record("changed")), current.version))).toMatchObject({ status: "refused", refusal: { code: "refused", message: expect.stringContaining("policy denied") } });
    expect(pushes).toBe(6);
  });
  it("recovers publication when a configured remote is restored", async () => {
    const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
    const ports = testStorePorts(clones.cloneA, makeGitExec(clones.cloneA), makeGitExecInput(clones.cloneA));
    ports.identity = async () => SlugSchema.parse("andrew"); ports.remote = async () => "origin";
    const store = createStore(ports);
    const moved = `${clones.origin}-temporarily-moved`;
    await rename(clones.origin, moved);
    try { expect(await store.write(put())).toMatchObject({ status: "refused", refusal: { code: "unreachable", cause: "error" } }); }
    finally { await rename(moved, clones.origin); }
    expect((await store.write(put())).status).toBe("ok");
  });
  it("retains unreadable entry diagnostics and throws its read until the boundary is repaired", async () => {
    const h = await fixture(); const landed = ok(await h.store.write(put()));
    const original = h.ports.exec;
    const ioFailure = Object.assign(new Error("Blob temporarily unreadable"),{code:"EIO"});
    h.ports.exec = async (command, args, options) => { if (args[0] === "cat-file" && args[1] === "blob") throw ioFailure; return original(command, args, options); };
    const snapshot = await readTransientIdentitySnapshot({ ...h.io, exec: h.ports.exec });
    expect(snapshot).toMatchObject({ kind: "complete", diagnostics: [{ kind: "unreadable", key: "alpha", message: "Blob temporarily unreadable" }] });
    expect(ok(await h.store.list({ family: "work-item", kind: "work-item/record" }))).toMatchObject({ status: "complete", records: [], diagnostics: [{ kind: "unreadable", key: "alpha", condition: "Blob temporarily unreadable" }] });
    await expect(h.store.read({ reference })).rejects.toMatchObject({ code: "store.operation-failed", cause:{cause:ioFailure} });
    const write = put(serializeTransientIdentityRecord(record()),landed.version!);
    await expect(h.store.write(write)).rejects.toMatchObject({code:"store.operation-failed",cause:{cause:ioFailure}});
    h.ports.exec = original;
    expect(ok(await h.store.read({ reference })).fields).toEqual(record());
    expect((await h.store.write(write)).status).toBe("ok");
  });
  it("refuses every write after clone divergence and permits the documented manual repair", async () => {
    const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
    const at = (root: string) => { const ports = testStorePorts(root, makeGitExec(root), makeGitExecInput(root)); ports.identity = async () => SlugSchema.parse("andrew"); ports.remote = async () => "origin"; return { ports, store: createStore(ports) }; };
    const a = at(clones.cloneA); const b = at(clones.cloneB);
    const first = ok(await a.store.write(put()));
    ok(await b.store.write(put(serializeTransientIdentityRecord(record()), first.version!)));
    a.ports.remote = async () => null;
    const local = ok(await a.store.write(put(serializeTransientIdentityRecord(record("local")), first.version!)));
    const remote = ok(await b.store.write(put(serializeTransientIdentityRecord(record("remote")), first.version!)));
    a.ports.remote = async () => "origin";
    const betaReference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" }));
    const beta = { ...put(serializeTransientIdentityRecord({ ...record(), slug: SlugSchema.parse("beta"), branch: "chore/beta" })), reference: betaReference };
    expect(await a.store.write(beta)).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [reference], remedy: { text: expect.stringContaining("hand repair") } } });
    expect(await transactTransientIdentities({ identity: "andrew", exec: a.ports.exec, execInput: a.ports.execInput }, { remote: "origin", message: "Inspect divergence", transform: () => ({ kind: "idempotent", value: null }) })).toMatchObject({ kind: "refused", reason: "Divergent identity keys: alpha", divergentKeys: ["alpha"] });
    expect(await a.store.read({ reference: betaReference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    a.ports.remote = async () => null;
    ok(await a.store.write(put(serializeTransientIdentityRecord(record("remote")), local.version!)));
    a.ports.remote = async () => "origin";
    expect((await a.store.write(beta)).status).toBe("ok");
    expect(ok(await a.store.read({ reference })).version).toBe(remote.version);
  });
  it("exposes remote failure causes and optional exact blob basis without changing legacy messages", async () => {
    const h = await fixture(); ok(await h.store.write(put()));
    const snapshot = await readTransientIdentitySnapshot(h.io);
    if (snapshot.kind !== "complete") throw new Error("Expected snapshot");
    const basis = await transactTransientIdentities(h.io, { remote: null, message: "Observe blob basis", transform: (_records, objects) => ({ kind: "idempotent", value: objects?.get("alpha") }) });
    expect(basis).toMatchObject({ kind: "idempotent", value: snapshot.objects.get("alpha") });
    for (const [stderr, remoteFailure] of [["Could not read from remote repository", { code: "unreachable", cause: "error" }], ["Could not resolve host: example.test", { code: "unreachable", cause: "network" }], ["Authentication failed", { code: "unreachable", cause: "auth" }], ["remote: policy denied", { code: "refused", message: expect.stringContaining("policy denied") }]] as const) {
      const exec: typeof h.io.exec = async (command, args, options) => { if (args[0] === "fetch") throw makeGitProcessError({ command, args: [...args], exitCode: 128, stderr }); return h.io.exec(command, args, options); };
      const outcome = await transactTransientIdentities({ ...h.io, exec }, { remote: "origin", message: "Observe failure", transform: () => ({ kind: "idempotent", value: null }) });
      expect(outcome).toMatchObject({ kind: "error", stage: "fetch", message: expect.stringContaining(stderr), remoteFailure });
    }
  });
  it.each(["groom", "housekeep"] as const)("names the actual %s role when another record diverges", async (role) => {
    const clones = await setupMultiClone(); onTestFinished(clones.cleanup);
    const io = (root: string) => ({ identity: "andrew", exec: makeGitExec(root), execInput: makeGitExecInput(root) });
    const a = io(clones.cloneA); const b = io(clones.cloneB);
    const base = role === "groom"
      ? TransientIdentityRecordSchema.parse({ version: 3, kind: "groom", slug: "groom-beta", claimId: "b".repeat(32), anchorStub: "beta", members: ["beta"], openedBaseHead: "a".repeat(40), protection: "partial", branch: null, state: "open", changeRequest: null, createdAt: record().createdAt, updatedAt: record().updatedAt })
      : TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "housekeep-routing", slug: "groom-routing", claimId: "c".repeat(32), branch: "chore/groom-routing", state: "open", savedHead: null, changeRequest: null, createdAt: record().createdAt, updatedAt: record().updatedAt });
    const publish = (target: typeof a, remote: string | null, updatedAt: string) => transactTransientIdentities(target, { remote, message: "Update claim", transform: (records) => ({ kind: "applied", records: new Map([...records, [base.slug, TransientIdentityRecordSchema.parse({ ...base, updatedAt })]]), value: null }) });
    await transactTransientIdentities<unknown>(a, { remote: "origin", message: "Claim producer", transform: base.kind === "groom" ? groomClaimTransform(base) : base.purpose === "housekeep-routing" ? housekeepClaimTransform(base) : () => { throw new Error("Wrong producer role"); } });
    await publish(b, "origin", base.updatedAt);
    await publish(a, null, "2026-07-18T00:00:01.000Z");
    await publish(b, "origin", "2026-07-18T00:00:02.000Z");
    const ports = testStorePorts(clones.cloneA, a.exec, a.execInput); ports.identity = async () => SlugSchema.parse("andrew"); ports.remote = async () => "origin";
    const store = createStore(ports);
    const expected = recordReferences[role === "groom" ? "claims/groom" : "claims/housekeep"](OwnerIdentitySchema.parse({ type: "person", name: "andrew" }), base.slug);
    expect(await store.write(put())).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [expected] } });
    await publish(a, null, "2026-07-18T00:00:02.000Z");
    expect((await store.write(put())).status).toBe("ok");
  });
});
