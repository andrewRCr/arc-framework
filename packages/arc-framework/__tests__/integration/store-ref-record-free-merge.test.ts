/** Divergent record-free sides retain real ownership without borrowing record state. */
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath, type StoredRecordHome } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const shapes = ["empty", "metadata", "manifest-root", "manifest-child"] as const;
function auxiliary(home: StoredRecordHome, shape: typeof shapes[number]) {
  return shape === "empty" ? [] : [{ path: shape === "metadata" ? home.metadataPath
    : shape === "manifest-root" ? home.manifestPath.slice(0, -1) : home.manifestPath + "retained", content: "Auxiliary bytes\n" }];
}

describe.each(["default", "separate"] as const)("ordinary record-free merge in %s", layout => {
  it.each(shapes)("merges a %s deletion against a concurrent personal change and publishes its conflict", async shape => {
    const h = await refSyncFixture(layout), reference = RecordReferenceSchema.parse({ kind: "personal/document",
      owner: { type: "person", name: "andrew" }, key: "removed.md" }), home = expandStoredPath(reference);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "Base\n", provenance: testProvenance }));
    const base = success(await h.a.store.read({ reference }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference, expected: base.version, content: "Local change\n", provenance: testProvenance }));
    const local = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    success(await h.b.store.write({ action: "remove", reference, expected: base.version, provenance: testProvenance }));
    const removed = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    const incoming = await plantRef(h.b.root, home.ref, auxiliary(home, shape), { parents: [removed], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${incoming.tip}:${home.ref}`]);
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect(await h.a.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const listed = success(await h.a.store.list({ family: "personal", kind: "personal/conflict-record" }));
    if (!("records" in listed) || listed.records.length !== 1) throw new Error("Expected the retained deletion/change clash");
    expect(JSON.parse(listed.records[0]!.content)).toMatchObject({ location: { kind: "record" },
      base: { content: base.content }, current: { value: null }, incoming: { value: { content: "Local change\n" } } });
    const merged = (await h.a.git(["rev-list", "--parents", "-n", "1", home.ref])).stdout.trim().split(" ");
    expect(merged.slice(1)).toEqual([local, incoming.tip]);
    success(await h.a.store.push());
    expect((await h.remote("git", ["rev-parse", home.ref])).stdout.trim()).toBe(merged[0]);
  });

  it.each(["project-inbox/inbox", "cohort/document", "work-item/meta"] as const)("uses captured %s authority when both tips are record-free", async kind => {
    const h = await refSyncFixture(layout), reference = RecordReferenceSchema.parse({ kind,
      owner: { type: kind === "cohort/document" ? "cohort" : kind === "work-item/meta" ? "work-item" : "project",
        name: kind === "project-inbox/inbox" ? "project" : "known" } });
    const made = success(await h.a.store.write({ action: "put", reference, expected: null,
      content: kind === "work-item/meta" ? makeMetaFixture("known") : kind === "cohort/document"
        ? "# Known\n\n**Purpose:** Preserve authenticated cohort identity.\n" : "# Known\n",
      ...kind === "work-item/meta" ? { placement: { kind: "active" as const } } : {}, provenance: testProvenance }));
    const home = expandStoredPath(made.reference), base = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    success(await h.a.store.push()); success(await h.b.store.pull());
    const local = await plantRef(h.a.root, home.ref, auxiliary(home, "metadata"), { parents: [base], gitDir: h.a.gitDir });
    const incoming = await plantRef(h.b.root, home.ref, auxiliary(home, "manifest-child"), { parents: [base], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${incoming.tip}:${home.ref}`]);
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    const merged = (await h.a.git(["rev-list", "--parents", "-n", "1", home.ref])).stdout.trim().split(" ");
    expect(merged.slice(1)).toEqual([local.tip, incoming.tip]);
    expect(await h.a.store.read({ reference: made.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await h.a.store.push());
    expect((await h.remote("git", ["rev-parse", home.ref])).stdout.trim()).toBe(merged[0]);
  });

  it("keeps an unchanged personal record deleted without retaining a conflict", async () => {
    const h = await refSyncFixture(layout), reference = RecordReferenceSchema.parse({ kind: "personal/document",
      owner: { type: "person", name: "andrew" }, key: "removed.md" }), home = expandStoredPath(reference);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "Base\n", provenance: testProvenance }));
    const base = success(await h.a.store.read({ reference })), tip = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    const metadata = (await h.a.git(["rev-parse", `${tip}:${home.metadataPath}`])).stdout.trim();
    success(await h.a.store.push()); success(await h.b.store.pull());
    await plantRef(h.a.root, home.ref, [{ path: home.path, content: base.content }, { path: home.metadataPath, oid: metadata, mode: "100644" },
      ...auxiliary(home, "manifest-child")], { parents: [tip], gitDir: h.a.gitDir });
    success(await h.b.store.write({ action: "remove", reference, expected: base.version, provenance: testProvenance }));
    const removed = (await h.b.git(["rev-parse", home.ref])).stdout.trim();
    const incoming = await plantRef(h.b.root, home.ref, auxiliary(home, "metadata"), { parents: [removed], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${incoming.tip}:${home.ref}`]);
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect(await h.a.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await h.a.store.list({ family: "personal", kind: "personal/conflict-record" })).status).toBe("absent");
    success(await h.a.store.push());
  });

  it("requires real cohort authority and retries after a genuine metadata repair", async () => {
    const h = await refSyncFixture(layout), requested = RecordReferenceSchema.parse({ kind: "cohort/document",
      owner: { type: "cohort", name: "unclaimed" } });
    const content = "# Unclaimed\n\n**Purpose:** Establish the cohort's actual identity.\n";
    const made = success(await h.a.store.write({ action: "put", reference: requested, expected: null, content, provenance: testProvenance }));
    const reference = made.reference, home = expandStoredPath(reference);
    const metadata = (await h.a.git(["rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim();
    // Replace the ref with a new root: neither captured side nor base retains the old identity evidence.
    const base = await plantRef(h.a.root, home.ref, [], { gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${base.tip}:${home.ref}`]);
    await h.b.git(["fetch", h.remoteName, `${home.ref}:${home.ref}`]);
    const local = await plantRef(h.a.root, home.ref, auxiliary(home, "manifest-child"), { parents: [base.tip], gitDir: h.a.gitDir });
    const incoming = await plantRef(h.b.root, home.ref, [], { parents: [base.tip], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${incoming.tip}:${home.ref}`]);
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices))
      .toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref }));
    expect((await h.a.git(["rev-parse", home.ref])).stdout.trim()).toBe(local.tip);
    await h.a.git(["push", h.remoteName, `${metadata}:refs/testing/metadata`]);
    await h.b.git(["fetch", h.remoteName, "refs/testing/metadata"]);
    const repaired = await plantRef(h.b.root, home.ref, [{ path: home.path, content }, { path: home.metadataPath, oid: metadata, mode: "100644" }],
      { parents: [incoming.tip], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${repaired.tip}:${home.ref}`]);
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect(success(await h.a.store.read({ reference })).content).toBe(content);
    success(await h.a.store.push());
  });

  it("refuses a real-record merge base without metadata and continues from a readable repaired interval", async () => {
    const h = await refSyncFixture(layout), reference = RecordReferenceSchema.parse({ kind: "personal/document",
      owner: { type: "person", name: "andrew" }, key: "damaged.md" }), home = expandStoredPath(reference);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "Base\n", provenance: testProvenance }));
    const original = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    const metadata = (await h.a.git(["rev-parse", `${original}:${home.metadataPath}`])).stdout.trim();
    const damaged = await plantRef(h.a.root, home.ref, [{ path: home.path, content: "Base\n" }], { parents: [original], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${damaged.tip}:${home.ref}`]);
    await h.b.git(["fetch", h.remoteName, `${home.ref}:${home.ref}`]);
    const entries = [{ path: home.path, content: "Base\n" }, { path: home.metadataPath, oid: metadata, mode: "100644" as const }];
    const local = await plantRef(h.a.root, home.ref, entries, { parents: [damaged.tip], message: "Local forward metadata repair", gitDir: h.a.gitDir });
    const incoming = await plantRef(h.b.root, home.ref, entries, { parents: [damaged.tip], message: "Incoming forward metadata repair", gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${incoming.tip}:${home.ref}`]);
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices))
      .toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref }));
    expect((await h.a.git(["rev-parse", home.ref])).stdout.trim()).toBe(local.tip);
    await h.a.git(["push", h.remoteName, `${local.tip}:refs/testing/readable-local`]);
    await h.b.git(["fetch", h.remoteName, "refs/testing/readable-local"]);
    const repaired = await plantRef(h.b.root, home.ref, entries, { parents: [local.tip, incoming.tip], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${repaired.tip}:${home.ref}`]);
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect(success(await h.a.store.read({ reference })).content).toBe("Base\n");
    // Current state repairs do not replace exact undecodable historical evidence.
    expect(await h.a.store.history({ reference })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
  });
});
