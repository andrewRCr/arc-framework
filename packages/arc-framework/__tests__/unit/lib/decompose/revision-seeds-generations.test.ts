import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit, readLifecycleMetaFields, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";

it.each([
  { retiredHolders: 1, started: false },
  { retiredHolders: 1, started: true },
  { retiredHolders: 2, started: false },
  { retiredHolders: 2, started: true },
])("preserves a groomed dependency after $retiredHolders retired holders, started=$started", async ({ retiredHolders, started }) => {
  const h = await createDecomposeTerminalFixture();
  const retained = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(retained, writeMetaDependsOn(retained.content, []));
  for (let index = 0; index < retiredHolders; index += 1) {
    await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-b")));
    if (index + 1 < retiredHolders) await h.seedStub("member-b");
  }
  const replacement = await h.seedStub("member-b");
  const current = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(current, writeMetaDependsOn(current.content, ["member-b"]));
  if (started) {
    const authored = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
    lifecycleSuccess(await h.store.write({ ...recordPut(authored, { placement: { kind: "active" } }),
      provenance: { verb: "start", lifecycleAction: "start" } }));
  }
  const map = structuredClone(h.map);
  const second = map.authoring.destinations[1];
  if (second?.kind !== "new-member") throw new Error("Expected second member.");
  second.slug = "member-c";
  map.authoring.internalEdges = [];
  const input = { cutMap: map, cutMapPath: "revision.json" };
  const preview = await runStoreDecomposeRevision(h.ctx, "origin", input);
  expect(preview).toMatchObject({ status: "ok", result: { kind: "preview" } });
  if (preview.status !== "ok" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeRevision(h.ctx, "origin", input, { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
  expect(lifecycleSuccess(await readWorkUnit(h.store, "member-b"))).toEqual(replacement);
  const after = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  expect(lifecycleSuccess(readLifecycleMetaFields(after)).dependsOn).toEqual(["member-b"]);
});

it("removes the old member's retirement replacements while preserving its unrelated new name holder", async () => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const upstream = await h.seedStub("upstream");
  const ref = (record: StoreRecord) => {
    const owner = record.reference.owner;
    if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected work-item generation.");
    return { name: owner.name, uid: owner.uid };
  };
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-b")), {
    kind: "decompose", successors: [ref(upstream)], incoming: [{ dependent: ref(member),
      disposition: { kind: "replace", replacementTargets: [ref(upstream)] } }],
  });
  await h.handEdit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")), writeMetaDependsOn(member.content, ["upstream"]));
  const replacement = await h.seedStub("member-b");
  await h.handEdit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")), writeMetaDependsOn(member.content, ["upstream", "member-b"]));
  const map = structuredClone(h.map);
  const second = map.authoring.destinations[1];
  if (second?.kind !== "new-member") throw new Error("Expected second member.");
  second.slug = "member-c";
  map.authoring.internalEdges = [];
  const input = { cutMap: map, cutMapPath: "revision.json" };
  const preview = await runStoreDecomposeRevision(h.ctx, "origin", input);
  if (preview.status !== "ok" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeRevision(h.ctx, "origin", input, { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
  expect(lifecycleSuccess(await readWorkUnit(h.store, "member-b"))).toEqual(replacement);
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "member-a")))).dependsOn).toEqual(["member-b"]);
});
