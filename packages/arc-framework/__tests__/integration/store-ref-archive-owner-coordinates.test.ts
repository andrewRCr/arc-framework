/** Archive folder coordinates must agree with the role and owner inside their metadata. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");
const cases = [
  { kind: "work-item/meta", damage: "slug" },
  { kind: "cohort/document", damage: "slug" },
  { kind: "work-item/record", damage: "slug" },
  { kind: "work-item/record", damage: "UID suffix" },
  { kind: "work-item/meta", damage: "role suffix" },
  { kind: "cohort/document", damage: "missing cohort marker" },
] as const;

describe.each(["default", "separate"] as const)("archive owner coordinates in %s", layout => {
  it.each(cases)("diagnoses $kind with a wrong $damage and resumes sync after forward repair", async ({ kind, damage }) => {
    const f = await createRefFixture({}, layout), created = await seed(f, f.reference(kind));
    success(await f.store.write({ ...update(f, created, created.content), placement: { kind: "completed", quarter } }));
    const record = success(await f.store.read({ reference: created.reference }));
    const home = expandStoredPath(record.reference, { placement: record.placement });
    const root = home.path.slice(0, home.path.indexOf("/") + 1);
    const badRoot = damage === "UID suffix" ? root.replace(/[0-9a-f]{8}\/$/u, "deadbeef/")
      : damage === "role suffix" ? root.replace(/^(\d+)_/u, "$1a_")
        : damage === "missing cohort marker" ? root.replace("cohort-", "")
          : root.replace(record.reference.owner.name, "wrong-owner");
    expect(badRoot).not.toBe(root);
    const peer = f.remote(true);
    if (!peer) throw new Error("Expected the independent peer");
    success(await f.store.push());
    success(await peer.pull());
    const entries = await capturedEntries(f, home.ref), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const parent = (await f.ports.exec("git", [...scope, "rev-parse", home.ref], { cwd: f.root })).stdout.trim();
    const broken = await plantRef(f.root, home.ref, entries.map(entry => ({ ...entry, path: badRoot + entry.path.slice(root.length) })),
      { parents: [parent], gitDir: f.gitDir });
    const asOf = await f.settle(), key = `${home.ref}:${badRoot}`, family = kind === "cohort/document" ? "cohort" : "work-item";
    for (const saved of [false, true]) {
      const listing = success(await f.store.list({ family, ...saved ? { asOf } : {} }));
      expect(listing).toMatchObject({ status: "complete", missed: true, diagnostics: expect.arrayContaining([
        expect.objectContaining({ kind: "key-mismatch", key, condition: expect.stringContaining(key),
          remedy: { text: saved ? expect.stringMatching(/historical|ancestor/iu) : expect.stringMatching(/repair|restore/iu) } }),
      ]) });
      expect(await f.store.read({ reference: record.reference, ...saved ? { asOf } : {} }))
        .toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", condition: expect.stringContaining(key) } });
    }
    const remote = layout === "separate" ? "backing" : "origin";
    await f.ports.exec("git", [...scope, "push", remote, `${broken.tip}:${home.ref}`], { cwd: f.root });
    expect(success(await peer.pull()).pulls.flatMap(outcome => outcome.notices))
      .toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref, condition: expect.stringContaining(key) }));
    expect(success(await peer.read({ reference: record.reference })).content).toBe(record.content);
    const repaired = await plantRef(f.root, home.ref, entries, { parents: [broken.tip], gitDir: f.gitDir });
    expect(success(await f.store.read({ reference: record.reference })).content).toBe(record.content);
    expect(success(await f.store.list({ family }))).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
    expect(success(await f.store.list({ family, asOf }))).toMatchObject({ status: "complete", missed: true,
      diagnostics: expect.arrayContaining([expect.objectContaining({ kind: "key-mismatch", key,
        remedy: { text: expect.stringMatching(/historical|ancestor/iu) } })]) });
    await f.ports.exec("git", [...scope, "push", remote, `${repaired.tip}:${home.ref}`], { cwd: f.root });
    expect(success(await peer.pull()).pulls.flatMap(outcome => outcome.notices)).toEqual([]);
    expect(success(await peer.read({ reference: record.reference })).content).toBe(record.content);
  }, 60_000);

  it.each(["work-item/meta", "cohort/document"] as const)("keeps a valid outer sequence authoritative for %s", async kind => {
    const f = await createRefFixture({}, layout), created = await seed(f, f.reference(kind));
    success(await f.store.write({ ...update(f, created, created.content), placement: { kind: "completed", quarter } }));
    const record = success(await f.store.read({ reference: created.reference }));
    const home = expandStoredPath(record.reference, { placement: record.placement });
    const root = home.path.slice(0, home.path.indexOf("/") + 1), nextRoot = root.replace(/^\d+/u, "17");
    const entries = await capturedEntries(f, home.ref), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const parent = (await f.ports.exec("git", [...scope, "rev-parse", home.ref], { cwd: f.root })).stdout.trim();
    await plantRef(f.root, home.ref, entries.map(entry => ({ ...entry, path: nextRoot + entry.path.slice(root.length) })),
      { parents: [parent], gitDir: f.gitDir });
    const asOf = await f.settle();
    for (const saved of [false, true]) {
      expect(success(await f.store.read({ reference: record.reference, ...saved ? { asOf } : {} })))
        .toMatchObject({ content: record.content, placement: { kind: "completed", quarter, sequence: "17" } });
      expect(success(await f.store.list({ family: kind === "cohort/document" ? "cohort" : "work-item", ...saved ? { asOf } : {} })))
        .toMatchObject({ status: "complete", missed: false, diagnostics: [] });
    }
  }, 60_000);
});
