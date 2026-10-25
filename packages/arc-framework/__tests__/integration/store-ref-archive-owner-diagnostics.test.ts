/** Corrupt archive-owner diagnostics retain the quarter and the path needed for repair. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { parseCohortDocument } from "../../src/lib/store/kinds/cohort/parser.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), ref = `refs/arc/archive/${quarter}`;
const malformedName = "metadata-00000000-0000-0000-0000-000000000001.json";

describe.each(["default", "separate"] as const)("archive owner diagnostics in %s", layout => {
  it.each(["close", "lookup", "list", "saved-list"] as const)("locates malformed ownership during %s and admits repair", async mode => {
    const f = await createRefFixture({ "cohort/document": { parser: parseCohortDocument } }, layout);
    const closing = await seed(f, f.reference("cohort/document", "closing"), "# Closing\n");
    const other = await seed(f, f.reference("cohort/document", "other"), "# Other\n");
    success(await f.store.write({ ...update(f, other), placement: { kind: "completed", quarter } }));
    const original = await capturedEntries(f, ref), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const parent = (await f.ports.exec("git", [...scope, "rev-parse", ref])).stdout.trim();
    const broken = await plantRef(f.root, ref, original.map(entry => ({ ...entry,
      path: entry.path.replace(/metadata-[0-9a-f-]{36}\.json$/u, malformedName),
    })), { parents: [parent], gitDir: f.gitDir });
    const asOf = await f.settle(), before = success(await f.store.version());
    const write = { ...update(f, closing), placement: { kind: "completed" as const, quarter } };
    const capture = () => mode === "close" ? f.store.write(write)
      : mode === "lookup" ? f.store.lookup({ kind: "slug", slug: other.reference.owner.name })
      : f.store.list({ family: "cohort", ...(mode === "saved-list" ? { asOf } : {}) });
    const result = await capture();
    if (mode === "close" || mode === "lookup") expect(result).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", namespace: ref, condition: expect.stringContaining(malformedName),
    } });
    else expect(result).toMatchObject({ status: "ok", result: { status: "complete", diagnostics: [expect.objectContaining({
      key: expect.stringContaining(`${ref}:`), condition: expect.stringContaining(malformedName),
      ...(mode === "saved-list" ? { remedy: { text: expect.stringMatching(/historical|ancestor/iu) } } : {}),
    })] } });
    expect(success(await f.store.version())).toBe(before);
    await plantRef(f.root, ref, original, { parents: [broken.tip], gitDir: f.gitDir });
    if (mode === "saved-list") {
      expect(await capture()).toEqual(result);
      expect(success(await f.store.list({ family: "cohort", asOf: await f.settle() })))
        .toMatchObject({ status: "complete", diagnostics: [] });
    } else expect(await capture()).toMatchObject({ status: "ok" });
    expect(success(await f.store.read({ reference: other.reference })).placement).toMatchObject({ kind: "completed", quarter });
  });
});
