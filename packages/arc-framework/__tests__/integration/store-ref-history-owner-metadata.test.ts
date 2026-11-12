/** Retained work and cohort histories reject invalid owner names before constructing record references. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { fixtureGit } from "../helpers/store/ref-fixture-git.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("retained owner metadata in %s", layout => {
  it.each(["work-item/meta", "cohort/document"] as const)("refuses an invalid historical slug for %s and reads restored history", async kind => {
    const f = await createRefFixture({}, layout), git = fixtureGit(f);
    const record = await seed(f, f.reference(kind));
    success(await f.store.write({ ...update(f, record, record.content),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const home = expandStoredPath(record.reference, { history: true });
    const parent = (await git("git", ["rev-parse", home.ref])).stdout.trim();
    const intact = await capturedEntries(f, home.ref);
    const metadata = JSON.parse((await git("git", ["show", `${parent}:${home.metadataPath}`])).stdout);
    const invalid = await plantRef(f.root, home.ref, intact.map(entry => entry.path === home.metadataPath
      ? { path: entry.path, content: JSON.stringify({ ...metadata, slug: "invalid/name" }) } : entry),
    { parents: [parent], gitDir: f.gitDir });
    const repaired = await plantRef(f.root, home.ref, intact, { parents: [invalid.tip], gitDir: f.gitDir });
    expect(await f.store.history({ reference: record.reference })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", namespace: home.ref,
      remedy: { text: expect.stringMatching(/historical|ancestor/iu) },
    } });
    expect(success(await f.store.read({ reference: record.reference })).content).toBe(record.content);
    await git("git", ["update-ref", home.ref, parent, repaired.tip]);
    expect(success(await f.store.history({ reference: record.reference })).map(({ content }) => content)).toContain(record.content);
  });
});
