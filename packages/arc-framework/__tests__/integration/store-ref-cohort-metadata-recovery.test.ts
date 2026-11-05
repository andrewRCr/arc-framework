/** Cohort closeout names metadata repair when another captured cohort has unusable metadata. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { parseCohortDocument } from "../../src/lib/store/kinds/cohort/parser.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, removeLooseObject, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("cohort metadata recovery in %s", layout => {
  it.each(["missing", "malformed", "missing-blob"] as const)("offers a usable repair for another cohort's %s metadata and resumes closeout", async mode => {
    const f = await createRefFixture({ "cohort/document": { parser: parseCohortDocument } }, layout);
    const closing = await seed(f, f.reference("cohort/document", "closing"), "# Closing\n");
    const other = await seed(f, f.reference("cohort/document", "other"), "# Other\n");
    const home = expandStoredPath(other.reference, { registry: f.ports.registry });
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const original = await capturedEntries(f, home.ref);
    const tip = (await f.ports.exec("git", [...args, "rev-parse", home.ref])).stdout.trim();
    const oid = (await f.ports.exec("git", [...args, "rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...args, "cat-file", "blob", oid])).stdout;
    const damaged = original.flatMap((entry): PlantTreeEntry[] => entry.path !== home.metadataPath ? [entry]
      : mode === "missing" ? [] : mode === "missing-blob" ? [entry] : [{ path: entry.path, content: "malformed metadata" }]);
    const planted = await plantRef(f.root, home.ref, damaged, { parents: [tip], gitDir: f.gitDir });
    const before = success(await f.store.version());
    if (mode === "missing-blob") await removeLooseObject(f.root, oid, f.gitDir);
    const write = { ...update(f, closing, closing.content),
      placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } };
    const result = await f.store.write(write);
    expect(result).toMatchObject({ status: "refused", refusal: { code: mode === "missing-blob" ? "state-unresolvable" : "namespace-corrupt",
      class: mode === "missing-blob" ? "recoverable" : "terminal" } });
    if (result.status !== "refused") throw new Error("Expected closeout refusal");
    expect(result.refusal.remedy.text).toMatch(mode === "missing-blob" ? /restore|fetch/iu : /metadata|repair.*forward/iu);
    if (mode === "missing") expect(result.refusal.condition).toContain("no metadata entry");
    expect(success(await f.store.version())).toBe(before);
    if (mode === "missing-blob") {
      const restored = await f.ports.rawExec([...args, "hash-object", "-w", "--stdin"], { input: bytes });
      expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    }
    await plantRef(f.root, home.ref, original, { parents: [planted.tip], gitDir: f.gitDir });
    success(await f.store.write(write));
    expect(success(await f.store.read({ reference: closing.reference })).placement)
      .toEqual({ kind: "completed", quarter: "2026-q4", sequence: "01", closeout: "a" });
  });
  it("keeps the existing metadata repair for a record-free cohort", async () => {
    const f = await createRefFixture({ "cohort/document": { parser: parseCohortDocument } }, layout);
    const closing = await seed(f, f.reference("cohort/document", "closing"), "# Closing\n");
    const other = await seed(f, f.reference("cohort/document", "other"), "# Other\n");
    const home = expandStoredPath(other.reference, { registry: f.ports.registry });
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const original = await capturedEntries(f, home.ref);
    const tip = (await f.ports.exec("git", [...args, "rev-parse", home.ref])).stdout.trim();
    const empty = await plantRef(f.root, home.ref, [], { parents: [tip], gitDir: f.gitDir });
    const before = success(await f.store.version());
    const write = { ...update(f, closing, closing.content),
      placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } };
    expect(await f.store.write(write)).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", namespace: home.ref,
      condition: `Metadata on ${home.ref} is missing or cannot be parsed`,
      remedy: { text: expect.stringMatching(/repair.*forward/iu) },
    } });
    expect(success(await f.store.version())).toBe(before);
    await plantRef(f.root, home.ref, original, { parents: [empty.tip], gitDir: f.gitDir });
    success(await f.store.write(write));
    expect(success(await f.store.read({ reference: closing.reference })).placement)
      .toEqual({ kind: "completed", quarter: "2026-q4", sequence: "01", closeout: "a" });
  });
});
