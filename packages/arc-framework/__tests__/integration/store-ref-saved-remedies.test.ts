/** Saved-state refusals offer remedies that can change a historical read's result. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, testProvenance } from "../helpers/store/suite-tools.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";

describe.each(["default", "separate"] as const)("saved-state remedies in %s", layout => {
  it.each(["read", "list"] as const)("keeps malformed saved project identity %s remedies historical after a forward repair", async operation => {
    const f = await createRefFixture({}, layout);
    await seed(f, f.reference("project-registry/identity"));
    const counter = await seed(f, f.reference("project-registry/counter"));
    const ref = "refs/arc/project/registry", original = await capturedEntries(f, ref);
    const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const parent = (await f.ports.exec("git", [...scope, "rev-parse", ref])).stdout.trim();
    const broken = await plantRef(f.root, ref, original.map(entry => entry.path === "identity.json"
      ? { path: entry.path, content: '{"projectId":"invalid"}' } : entry), { parents: [parent], gitDir: f.gitDir });
    const asOf = await f.settle();
    const capture = () => operation === "read" ? f.store.read({ reference: counter.reference, asOf })
      : f.store.list({ family: "project-registry", asOf });
    const result = await capture();
    if (operation === "read") expect(result).toMatchObject({ status: "refused", refusal: { code: "record-malformed",
      remedy: { text: expect.stringMatching(/historical|ancestor/iu) } } });
    else expect(result).toMatchObject({ status: "ok", result: { status: "complete", diagnostics: expect.arrayContaining([
      expect.objectContaining({ key: "identity.json", remedy: { text: expect.stringMatching(/historical|ancestor/iu) } }),
    ]) } });
    await plantRef(f.root, ref, original, { parents: [broken.tip], gitDir: f.gitDir });
    expect(await capture()).toEqual(result);
    expect(success(await f.store.read({ reference: counter.reference, asOf: await f.settle() })).content).toBe(counter.content);
  });

  it.each(["live", "archived"] as const)("describes absence in the saved %s state without asking for a batch repair", async location => {
    const f = await createRefFixture({}, layout), primary = await seed(f, f.reference("work-item/meta"));
    if (location === "archived") success(await f.store.write({ ...update(f, primary),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const asOf = success(await f.store.version());
    const reference = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "work-item/companion", key: "absent" });
    const result = await f.store.read({ reference, asOf });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    if (result.status !== "refused") throw new Error("Expected saved absence");
    expect(result.refusal.remedy.text).toMatch(/saved|historical/iu);
    expect(result.refusal.remedy.text).not.toMatch(/batch|retry the write/iu);
  });

  it("names object restoration and the saved read when its captured blob is unavailable", async () => {
    const f = await createRefFixture({}, layout), primary = await seed(f, f.reference("work-item/meta"));
    const reference = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "work-item/companion", key: "saved" });
    const content = "Saved companion bytes.\n";
    success(await f.store.write({ action: "put", reference, expected: null, content, provenance: testProvenance }));
    const asOf = success(await f.store.version()), home = expandStoredPath(reference, { registry: f.ports.registry });
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const oid = (await f.ports.exec("git", [...args, "rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    await removeLooseObject(f.root, oid, f.gitDir);
    const result = await f.store.read({ reference, asOf });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable" } });
    if (result.status !== "refused") throw new Error("Expected unavailable saved blob");
    expect(result.refusal.remedy.text).toMatch(/restore|fetch/iu);
    expect(result.refusal.remedy.text).toMatch(/saved/iu);
    expect(result.refusal.remedy.text).not.toMatch(/retry the write/iu);
    await f.ports.rawExec([...args, "hash-object", "-w", "--stdin"], { input: Buffer.from(content) });
    expect(success(await f.store.read({ reference, asOf })).content).toBe(content);
  });
});
