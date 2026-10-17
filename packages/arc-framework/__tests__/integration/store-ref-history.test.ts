import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { makeGitExec, makeGitExecInput } from "../helpers/integration.js";

describe("record history over state refs", () => {
  it("returns exact versions and provenance newest first without deduplicating repeated versions", async () => {
    const f = await createRefFixture();
    const reference = f.reference("personal/document");
    const first = await seed(f, reference, "first\n");
    const secondWrite = success(await f.store.write({ ...update(f, first, "second\n"),
      provenance: { ...testProvenance, lifecycleAction: "second" } }));
    const second = success(await f.store.read({ reference }));
    const thirdWrite = success(await f.store.write({ ...update(f, second, "first\n"),
      provenance: { ...testProvenance, lifecycleAction: "third" } }));
    const history = success(await f.store.history({ reference }));
    expect(history).toEqual([
      { reference, content: "first\n", version: first.version, provenance: { ...testProvenance, lifecycleAction: "third", reference,
        batchId: expect.any(String) } },
      { reference, content: "second\n", version: secondWrite.version, provenance: { ...testProvenance, lifecycleAction: "second", reference,
        batchId: expect.any(String) } },
      { reference, content: "first\n", version: first.version, provenance: { ...testProvenance, reference, batchId: expect.any(String) } },
    ]);
    expect(thirdWrite.version).toBe(first.version);
    expect(new Set(history.map((entry) => "batchId" in entry.provenance ? entry.provenance.batchId : "legacy")).size).toBe(3);
  });

  it("lists a metadata-only primary write while filtering unrelated metadata and companion writes", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    const companion = await seed(f, f.reference("work-item/task-list"));
    const moved = success(await f.store.write({ ...update(f, primary, primary.content),
      placement: { kind: "backlog", commitment: "planned" } }));
    const history = success(await f.store.history({ reference: primary.reference }));
    expect(history.map(({ content, version }) => ({ content, version }))).toEqual([
      { content: primary.content, version: moved.version }, { content: primary.content, version: primary.version },
    ]);
    expect(success(await f.store.history({ reference: companion.reference })).map(({ content, version }) => ({ content, version })))
      .toEqual([{ content: companion.content, version: companion.version }]);
  });

  it("records removal with null content and version after the lineage name leaves live metadata", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("lineage/transition"));
    success(await f.store.write({ action: "remove", reference: record.reference, expected: record.version,
      provenance: { ...testProvenance, lifecycleAction: "remove" } }));
    const history = success(await f.store.history({ reference: record.reference }));
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ reference: record.reference, version: null, content: null,
      provenance: { lifecycleAction: "remove", reference: record.reference } });
    expect(history[1]).toMatchObject({ reference: record.reference, version: record.version, content: record.content });
  });

  it("derives each record's owner UID from its tree on a shared registry commit", async () => {
    const f = await createRefFixture();
    const counter = f.reference("project-registry/counter");
    const lineage = f.reference("lineage/transition");
    const batch = success(await f.store.batch({ writes: [
      { action: "put", reference: counter, expected: null, content: f.content(counter) },
      { action: "put", reference: lineage, expected: null, content: f.content(lineage) },
    ], provenance: testProvenance }));
    const canonical = batch.writes[1]?.reference;
    if (canonical?.owner.type !== "work-item") throw new Error("No lineage owner");
    const counterHistory = success(await f.store.history({ reference: counter }));
    const lineageHistory = success(await f.store.history({ reference: lineage }));
    expect(counterHistory).toHaveLength(1);
    expect(lineageHistory).toHaveLength(1);
    expect(counterHistory[0]?.provenance).toEqual({ ...testProvenance, reference: counter, batchId: batch.batchId });
    expect(lineageHistory[0]?.provenance).toEqual({ ...testProvenance, reference: canonical, ownerUid: canonical.owner.uid, batchId: batch.batchId });
  });

  it("returns a never-projected Candidate above the projection size cap", async () => {
    const f = await createRefFixture();
    const content = JSON.stringify({ value: "x".repeat(1_048_577) });
    const record = await seed(f, f.reference("review/candidate"), content);
    const history = success(await f.store.history({ reference: record.reference }));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ reference: record.reference, content: record.content, version: record.version });
  });

  it("retains legacy messages and historical bytes without applying the current semantic parser", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("personal/document"), "first\n");
    const ref = "refs/arc/user/test-user/personal";
    const git = makeGitExec(f.root);
    const parent = (await git("git", ["rev-parse", ref])).stdout;
    const metadata = (await git("git", ["show", `${ref}:test-user/metadata-test-user.json`])).stdout;
    const message = "Human-authored change\n\nDetail preserved.\n";
    await plantRef(f.root, ref, [
      { path: "test-user/metadata-test-user.json", content: metadata },
      { path: `test-user/${record.reference.key}`, content: "legacy bytes\n" },
    ], { parents: [parent], message });
    const registry = f.ports.registry;
    if (!registry) throw new Error("No fixture registry");
    const reopened = createRefStore({ ...f.ports, registry: { ...registry, "personal/document": { ...registry["personal/document"],
      parser: () => ({ success: false as const, error: "This build requires different document fields" }) } } });
    expect(await reopened.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
    const history = success(await reopened.history({ reference: record.reference }));
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ content: "legacy bytes\n", provenance: { message } });
    expect(history[1]).toMatchObject({ content: record.content, version: record.version });
  });

  it("refuses unavailable historical bytes instead of inventing a removal and resumes after object restoration", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("personal/document"), "first\n");
    const ref = "refs/arc/user/test-user/personal";
    const git = makeGitExec(f.root);
    const parent = (await git("git", ["rev-parse", ref])).stdout;
    const metadata = (await git("git", ["show", `${ref}:test-user/metadata-test-user.json`])).stdout;
    const path = `test-user/${record.reference.key}`;
    const content = "Unavailable historical content\n";
    const planted = await plantRef(f.root, ref, [{ path: "test-user/metadata-test-user.json", content: metadata },
      { path, content }], { parents: [parent] });
    await removeLooseObject(f.root, planted.blobs.get(path)!);
    expect(await f.store.history({ reference: record.reference })).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", reference: record.reference, remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
    await makeGitExecInput(f.root)(["hash-object", "-w", "--stdin"], content);
    const history = success(await f.store.history({ reference: record.reference }));
    expect(history).toHaveLength(2);
    expect(history[0]?.content).toBe(content);
    expect(history.every((entry) => entry.version !== null)).toBe(true);
  });
});
