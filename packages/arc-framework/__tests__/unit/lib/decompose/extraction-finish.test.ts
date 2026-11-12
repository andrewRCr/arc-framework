/** Surviving-origin finish reports bind retained content and exact mutations across approval. */
import { expect, it } from "vitest";
import { createDecomposeExtractionFixture } from "../../../fixtures/decompose-extraction.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { sortByCanonicalBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaPriority } from "../../../../src/lib/store/kinds/meta/writers.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";

it("previews retained content and every extraction mutation without writing", async () => {
  const h = await createDecomposeExtractionFixture();
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeFinish(h.ctx, "origin")).toMatchObject({ status: "ok", result: {
    kind: "preview", mode: "extraction-finish", origin: { slug: "origin", uid: h.map.machine.origin.uid },
    applyAuthority: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    artifacts: [{ basename: "spec-origin-prd.md", reference: h.prd.reference, retainedContent: "# Origin PRD\n\n## Keep\n\nSurviving scope.\n\n" },
      { basename: "spec-origin-rfc.md", reference: h.rfc.reference, retainedContent: null }],
    writes: expect.arrayContaining([expect.objectContaining({ action: "remove", reference: h.additive.storedMap }),
      expect.objectContaining({ action: "remove", reference: h.rfc.reference }),
      expect.objectContaining({ action: "put", reference: h.prd.reference, content: "# Origin PRD\n\n## Keep\n\nSurviving scope.\n\n" })]),
  } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("requires fresh extraction approval after accepted member grooming", async () => {
  const h = await createDecomposeExtractionFixture();
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  await h.handEdit(h.member, writeMetaPriority(h.member.content, "P2"));
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "refused", reason: "stale-apply-authority", remedy: { argv: ["arc", "decompose", "origin", "--finish"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const fresh = await runStoreDecomposeFinish(h.ctx, "origin");
  if (fresh.status === "refused" || fresh.result.kind !== "preview") throw new Error(JSON.stringify(fresh));
  expect(fresh.result.applyAuthority).not.toBe(preview.result.applyAuthority);
  expect((await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: fresh.result.applyAuthority })).status).toBe("ok");
});

it("preserves only a competing write when extraction apply meets a version conflict", async () => {
  const h = await createDecomposeExtractionFixture();
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  const home = lifecycleSuccess(await readWorkUnit(h.store, "home"));
  h.ctx.executor.store = withCompetingBatch(h.store, async () => { await h.handEdit(home, writeMetaPriority(home.content, "P2")); });
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "refused", reason: "version-conflict", remedy: {
      argv: ["arc", "decompose", "origin", "--finish"], text: expect.stringMatching(/fresh.*preview.*approv/iu) } });
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(changes).toHaveLength(1);
  expect(changes[0]?.reference).toEqual(home.reference);
  const fresh = await runStoreDecomposeFinish(h.ctx, "origin");
  if (fresh.status === "refused" || fresh.result.kind !== "preview") throw new Error(JSON.stringify(fresh));
  expect((await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: fresh.result.applyAuthority })).status).toBe("ok");
});

it("reports no stored map after a discard removal rather than claiming a landed extraction", async () => {
  const h = await createDecomposeExtractionFixture();
  const stored = lifecycleSuccess(await h.store.read({ reference: h.additive.storedMap }));
  lifecycleSuccess(await h.store.batch({ provenance: { verb: "decompose", lifecycleAction: "discard" },
    writes: [{ action: "remove", reference: stored.reference, expected: stored.version }] }));
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeFinish(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "no-stored-map" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("preserves a native map-history failure and continues after the observation recovers", async () => {
  const h = await createDecomposeExtractionFixture();
  const stored = lifecycleSuccess(await h.store.read({ reference: h.additive.storedMap }));
  lifecycleSuccess(await h.store.batch({ provenance: { verb: "decompose", lifecycleAction: "discard" },
    writes: [{ action: "remove", reference: stored.reference, expected: stored.version }] }));
  const history = h.store.history.bind(h.store);
  const refusal: StoreRefusal = { code: "namespace-corrupt", namespace: "work", class: "terminal",
    condition: "The map history cannot be read.", remedy: { text: "Repair this history namespace." } };
  h.store.history = async input => input.reference.kind === "work-item/cut-map" ? { status: "refused", refusal } : history(input);
  expect(await runStoreDecomposeFinish(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "store",
    class: refusal.class, storeRefusal: refusal, remedy: refusal.remedy });
  h.store.history = history;
  expect(await runStoreDecomposeFinish(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "no-stored-map" });
});

it("reports a landed extraction from its terminal map removal without writing again", async () => {
  const h = await createDecomposeExtractionFixture();
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect((await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority })).status).toBe("ok");
  const before = lifecycleSuccess(await h.store.version());
  for (const options of [{}, { applyAuthority: preview.result.applyAuthority }]) {
    expect(await runStoreDecomposeFinish(h.ctx, "origin", options)).toMatchObject({ status: "ok", result: {
      kind: "landed", mode: "extraction-finish", origin: h.map.machine.origin, members: [{ name: "member-a" }],
    } });
  }
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("applies a matching extraction authority with exactly the previewed mutations", async () => {
  const h = await createDecomposeExtractionFixture();
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  const before = lifecycleSuccess(await h.store.version());
  const memberOwner = h.member.reference.owner;
  if (memberOwner.type !== "work-item") throw new Error("Expected member generation.");
  expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "applied", origin: { slug: "origin", uid: h.map.machine.origin.uid },
      members: [{ name: "member-a", uid: memberOwner.uid }], notices: [] } });
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(sortByCanonicalBytes(changes.map(change => ({ reference: change.reference, content: change.content }))))
    .toEqual(sortByCanonicalBytes(preview.result.writes.map(write => ({ reference: write.reference, content: write.action === "put" ? write.content : null }))));
});
