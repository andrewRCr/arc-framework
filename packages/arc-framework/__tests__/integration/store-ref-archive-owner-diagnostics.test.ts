/** Corrupt archive-owner diagnostics retain the quarter and the path needed for repair. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { parseCohortDocument } from "../../src/lib/store/kinds/cohort/parser.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { mutationOf, seed, success, update } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), ref = `refs/arc/archive/${quarter}`;
const malformedName = "metadata-00000000-0000-0000-0000-000000000001.json";

describe.each(["default", "separate"] as const)("archive owner diagnostics in %s", layout => {
  it.each(["close", "lookup", "list", "saved-list", "read", "saved-read", "history", "write", "batch"] as const)("locates malformed ownership during %s and admits repair", async mode => {
    const f = await createRefFixture({ "cohort/document": { parser: parseCohortDocument } }, layout);
    const closing = await seed(f, f.reference("cohort/document", "closing"), "# Closing\n");
    const other = await seed(f, f.reference("cohort/document", "other"), "# Other\n");
    success(await f.store.write({ ...update(f, other), placement: { kind: "completed", quarter } }));
    let completed = success(await f.store.read({ reference: other.reference }));
    const original = await capturedEntries(f, ref), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const parent = (await f.ports.exec("git", [...scope, "rev-parse", ref])).stdout.trim();
    const broken = await plantRef(f.root, ref, original.map(entry => ({ ...entry,
      path: entry.path.replace(/metadata-[0-9a-f-]{36}\.json$/u, malformedName),
    })), { parents: [parent], gitDir: f.gitDir });
    const asOf = await f.settle(), before = success(await f.store.version());
    const write = { ...update(f, closing), placement: { kind: "completed" as const, quarter } };
    const capture = (revision = asOf) => mode === "close" ? f.store.write(write)
      : mode === "lookup" ? f.store.lookup({ kind: "slug", slug: other.reference.owner.name })
      : mode === "history" ? f.store.history({ reference: other.reference })
      : mode === "write" ? f.store.write(update(f, completed, "# Changed\n"))
      : mode === "batch" ? f.store.batch({ writes: [mutationOf(update(f, completed, "# Changed\n"))], provenance: write.provenance })
      : mode === "read" || mode === "saved-read" ? f.store.read({ reference: other.reference,
        ...(mode === "saved-read" ? { asOf: revision } : {}) })
      : f.store.list({ family: "cohort", ...(mode === "saved-list" ? { asOf: revision } : {}) });
    const result = await capture();
    if (mode !== "list" && mode !== "saved-list") expect(result).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", namespace: ref, condition: expect.stringContaining(malformedName),
      remedy: { text: expect.stringMatching(mode === "saved-read" ? /historical|ancestor/iu : /Restore.*owner UID/iu) },
    } });
    else expect(result).toMatchObject({ status: "ok", result: { status: "complete", diagnostics: [expect.objectContaining({
      key: expect.stringContaining(`${ref}:`), condition: expect.stringContaining(malformedName),
      ...(mode === "saved-list" ? { remedy: { text: expect.stringMatching(/historical|ancestor/iu) } } : {}),
    })] } });
    expect(success(await f.store.version())).toBe(before);
    await plantRef(f.root, ref, original, { parents: [broken.tip], gitDir: f.gitDir });
    if (mode === "saved-list" || mode === "saved-read") {
      expect(await capture()).toEqual(result);
      const repaired = await capture(await f.settle());
      expect(repaired).toMatchObject({ status: "ok", result: mode === "saved-list" ? { status: "complete", diagnostics: [] }
        : { reference: other.reference, placement: { kind: "completed", quarter } } });
    } else {
      completed = success(await f.store.read({ reference: other.reference }));
      const repaired = await capture();
      expect(repaired).toMatchObject({ status: "ok" });
      if (mode === "history") expect(repaired).toMatchObject({ result: expect.arrayContaining([expect.objectContaining({ reference: other.reference })]) });
      if (mode === "write" || mode === "batch") expect(success(await f.store.read({ reference: other.reference })).content).toBe("# Changed\n");
    }
    expect(success(await f.store.read({ reference: other.reference })).placement).toMatchObject({ kind: "completed", quarter });
  });
});
