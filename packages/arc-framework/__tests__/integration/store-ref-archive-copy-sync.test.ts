/** Retained history cannot inject reserved metadata candidates through archive refresh during pull. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "save", lifecycleAction: "save" };
const reserved = "metadata-ffffffff-ffff-4fff-bfff-ffffffffffff.json";

describe.each(["default", "separate"] as const)("archive copy admission during sync in %s", layout => {
  it.each(["fast-forward", "merge"] as const)("holds a %s with a reserved retained path and retries a forward rename", async mode => {
    const h = await refSyncFixture(layout);
    const primary = success(await h.a.store.write({ action: "put", expected: null, reference: RecordReferenceSchema.parse({
      kind: "work-item/meta", owner: { type: "work-item", name: "copy-sync" } }), content: makeMetaFixture("copy-sync"),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const active = success(await h.a.store.read({ reference: primary.reference }));
    success(await h.a.store.write({ action: "put", reference: primary.reference, expected: active.version, content: active.content,
      placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    if (!("uid" in primary.reference.owner)) throw new Error("Expected stored owner UID");
    const history = HistoryRefSchema.parse(`refs/arc/history/work/${primary.reference.owner.uid}`);
    success(await h.a.store.push()); success(await h.b.store.pull({ history: [history] }));
    if (mode === "merge") {
      const record = success(await h.a.store.read({ reference: primary.reference }));
      success(await h.a.store.write({ action: "put", reference: record.reference, expected: record.version,
        content: `${record.content}\nLocal change.\n`, placement: { kind: "completed", quarter }, provenance }));
    }
    const parent = (await h.b.git(["rev-parse", history])).stdout.trim(), entries = await capturedEntries(h.b, history);
    const broken = await plantRef(h.b.root, history, [...entries, { path: reserved, content: "retained evidence\n" }],
      { parents: [parent], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${history}:${history}`]);
    const refs = async () => (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const before = await refs(), kept = success(await h.a.store.read({ reference: primary.reference }));
    const pulled = success(await h.a.store.pull({ history: [history] }));
    expect(pulled.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: history,
      condition: expect.stringMatching(/reserved.*metadata|metadata.*reserved/iu), remedy: { text: expect.stringMatching(/rename.*retry/iu) } }));
    expect(await refs()).toBe(before);
    expect(success(await h.a.store.read({ reference: primary.reference }))).toMatchObject({ content: kept.content, placement: kept.placement });
    await plantRef(h.b.root, history, [...entries, { path: `evidence/${reserved}`, content: "retained evidence\n" }],
      { parents: [broken.tip], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${history}:${history}`]);
    const repaired = success(await h.a.store.pull({ history: [history] }));
    expect(repaired.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await h.a.store.read({ reference: RecordReferenceSchema.parse({ owner: primary.reference.owner,
      kind: "work-item/companion", key: `evidence/${reserved}` }) })).content).toBe("retained evidence\n");
    expect(success(await h.a.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", diagnostics: [] });
  }, 90_000);
});
