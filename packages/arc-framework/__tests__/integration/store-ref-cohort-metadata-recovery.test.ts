/** Cohort closeout names metadata repair when another captured cohort has unusable metadata. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { parseCohortDocument } from "../../src/lib/store/kinds/cohort/parser.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("cohort metadata recovery in %s", layout => {
  it.each(["missing", "malformed"] as const)("offers a usable repair for another cohort's %s metadata and resumes closeout", async mode => {
    const f = await createRefFixture({ "cohort/document": { parser: parseCohortDocument } }, layout);
    const closing = await seed(f, f.reference("cohort/document", "closing"), "# Closing\n");
    const other = await seed(f, f.reference("cohort/document", "other"), "# Other\n");
    const home = expandStoredPath(other.reference, { registry: f.ports.registry });
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const original = await capturedEntries(f, home.ref);
    const tip = (await f.ports.exec("git", [...args, "rev-parse", home.ref])).stdout.trim();
    const damaged = original.flatMap((entry): PlantTreeEntry[] => entry.path !== home.metadataPath ? [entry]
      : mode === "missing" ? [] : [{ path: entry.path, content: "malformed metadata" }]);
    const planted = await plantRef(f.root, home.ref, damaged, { parents: [tip], gitDir: f.gitDir });
    const before = success(await f.store.version());
    const write = { ...update(f, closing, closing.content),
      placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") } };
    const result = await f.store.write(write);
    expect(result).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", namespace: home.ref } });
    if (result.status !== "refused") throw new Error("Expected closeout refusal");
    expect(result.refusal.remedy.text).toMatch(/metadata|repair.*forward/iu);
    expect(success(await f.store.version())).toBe(before);
    await plantRef(f.root, home.ref, original, { parents: [planted.tip], gitDir: f.gitDir });
    success(await f.store.write(write));
    expect(success(await f.store.read({ reference: closing.reference })).placement)
      .toEqual({ kind: "completed", quarter: "2026-q4", sequence: "01", closeout: "a" });
  });
});
