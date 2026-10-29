/** External ambiguous archive ownership is diagnosed without choosing a candidate. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");
const names = ["metadata-00000000-0000-4000-8000-000000000000.json", "metadata-ffffffff-ffff-4fff-bfff-ffffffffffff.json"];

describe.each(["default", "separate"] as const)("ambiguous archive metadata in %s", layout => {
  for (const [order, name] of names.entries()) it.each(["text", "metadata"] as const)(`diagnoses lexical ${order} %s candidates in every view and sync, then repairs forward`, async format => {
    const f = await createRefFixture({}, layout);
    const primary = await seed(f, f.reference("work-item/meta", "target"));
    const healthy = await seed(f, f.reference("work-item/meta", "healthy"));
    for (const record of [primary, healthy]) success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter } }));
    const completed = success(await f.store.read({ reference: primary.reference }));
    const home = expandStoredPath(completed.reference, { placement: completed.placement });
    const root = home.path.slice(0, home.path.indexOf("/") + 1), key = `${home.ref}:${root}`;
    const peer = f.remote(true);
    if (!peer) throw new Error("Expected independent peer");
    success(await f.store.push());
    success(await peer.pull());
    const entries = await capturedEntries(f, home.ref), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const parent = (await f.ports.exec("git", [...scope, "rev-parse", home.ref])).stdout.trim();
    const ownMetadata = entries.find(entry => entry.path === root + `metadata-${"uid" in primary.reference.owner ? primary.reference.owner.uid : ""}.json`);
    if (!ownMetadata) throw new Error("Missing producer's owner metadata");
    const extra = format === "metadata" ? { ...ownMetadata, path: root + name } : { path: root + name, content: "ordinary text\n" };
    const broken = await plantRef(f.root, home.ref, [...entries, extra], { parents: [parent], gitDir: f.gitDir });
    const asOf = await f.settle(), before = success(await f.store.version());
    for (const saved of [false, true]) {
      const state = saved ? { asOf } : {};
      const listing = success(await f.store.list({ family: "work-item", ...state }));
      expect.soft(listing).toMatchObject({ status: "complete", missed: true, diagnostics: expect.arrayContaining([
        expect.objectContaining({ key, condition: expect.stringMatching(/ambiguous.*metadata|metadata.*ambiguous/iu),
          remedy: { text: expect.stringMatching(saved ? /historical|ancestor/iu : /new commit|forward/iu) } }),
      ]) });
      expect.soft(listing.status === "complete" && listing.records.some(record => record.reference.owner.name === healthy.reference.owner.name)).toBe(true);
      expect.soft(await f.store.read({ reference: primary.reference, ...state })).toMatchObject({ status: "refused", refusal: {
        code: "namespace-corrupt", condition: expect.stringMatching(/ambiguous.*metadata|metadata.*ambiguous/iu) } });
      expect.soft(await f.store.read({ reference: healthy.reference, ...state })).toMatchObject({ status: "ok", result: { content: healthy.content } });
    }
    expect.soft(await f.store.lookup({ kind: "slug", slug: primary.reference.owner.name })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", condition: expect.stringMatching(/ambiguous.*metadata|metadata.*ambiguous/iu) } });
    expect.soft(await f.store.write(update(f, completed))).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", condition: expect.stringMatching(/ambiguous.*metadata|metadata.*ambiguous/iu) } });
    expect.soft(success(await f.store.version())).toBe(before);
    const remote = layout === "separate" ? "backing" : "origin";
    await f.ports.exec("git", [...scope, "push", remote, `${broken.tip}:${home.ref}`]);
    expect.soft(success(await peer.pull()).pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref: home.ref, condition: expect.stringMatching(/ambiguous.*metadata|metadata.*ambiguous/iu),
    }));
    expect.soft(await peer.read({ reference: primary.reference })).toMatchObject({ status: "ok", result: { content: primary.content } });
    const repaired = await plantRef(f.root, home.ref, entries, { parents: [broken.tip], gitDir: f.gitDir });
    expect(success(await f.store.read({ reference: primary.reference })).content).toBe(primary.content);
    expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
    expect(await f.store.lookup({ kind: "slug", slug: primary.reference.owner.name })).toMatchObject({ status: "ok" });
    expect(success(await f.store.list({ family: "work-item", asOf }))).toMatchObject({ diagnostics: expect.arrayContaining([
      expect.objectContaining({ key, condition: expect.stringMatching(/ambiguous.*metadata|metadata.*ambiguous/iu),
        remedy: { text: expect.stringMatching(/historical|ancestor/iu) } }),
    ]) });
    const fresh = success(await f.store.read({ reference: primary.reference }));
    success(await f.store.write(update(f, fresh)));
    expect(success(await f.store.read({ reference: primary.reference })).content).toBe(f.content(primary.reference, "changed"));
    await f.ports.exec("git", [...scope, "push", remote, `${repaired.tip}:${home.ref}`]);
    expect(success(await peer.pull()).pulls.flatMap(outcome => outcome.notices)).toEqual([]);
    expect(success(await peer.read({ reference: primary.reference })).content).toBe(primary.content);
  }, 90_000);
});
