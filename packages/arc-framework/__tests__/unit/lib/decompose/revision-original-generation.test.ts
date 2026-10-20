/** Original member generations remain authoritative across later name reuse. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit, readLifecycleMetaFields } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";

function ref(record: StoreRecord) {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw Error("Expected generation.");
  return { name: owner.name, uid: owner.uid };
}

async function dropOldProvider(h: Awaited<ReturnType<typeof createDecomposeTerminalFixture>>) {
  const map = structuredClone(h.map);
  const second = map.authoring.destinations[1];
  if (second?.kind !== "new-member") throw Error("Expected member-b.");
  second.slug = "member-c";
  map.authoring.internalEdges = [];
  const input = { cutMap: map, cutMapPath: "independent-revision.json" };
  const preview = await runStoreDecomposeRevision(h.ctx, "origin", input);
  expect(preview).toMatchObject({ status: "ok", result: { kind: "preview" } });
  if (preview.status !== "ok" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  expect(await runStoreDecomposeRevision(h.ctx, "origin", input, { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
}

it("removes authenticated original retirement replacements across multiple retired same-name holders", async () => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const upstream = await h.seedStub("original-upstream");
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-b")), {
    kind: "decompose", successors: [ref(upstream)], incoming: [{ dependent: ref(member),
      disposition: { kind: "replace", replacementTargets: [ref(upstream)] } }],
  });
  await h.handEdit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")), writeMetaDependsOn(member.content, ["original-upstream"]));
  await h.seedRetiredWorkUnit(await h.seedStub("member-b"));
  const replacement = await h.seedStub("member-b");
  await h.handEdit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")), writeMetaDependsOn(member.content, ["original-upstream", "member-b"]));
  expect(await h.store.lookup({ kind: "lineage", origin: "member-b" })).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
  await dropOldProvider(h);
  expect(lifecycleSuccess(await readWorkUnit(h.store, "member-b"))).toEqual(replacement);
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "member-a")))).dependsOn).toEqual(["member-b"]);
});

it("preserves groomed edges from an unrelated retirement when exact terminal name shadows the original former name", async () => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(member, writeMetaDependsOn(member.content, []));
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
    { sourceSlug: "member-b", targetSlug: "original-retired-member" })).toMatchObject({ status: "renamed" });
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "original-retired-member")));
  const upstream = await h.seedStub("unrelated-upstream");
  const unrelated = await h.seedStub("member-b");
  await h.handEdit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")), writeMetaDependsOn(member.content, ["member-b"]));
  await h.seedRetiredWorkUnit(unrelated, {
    kind: "decompose", successors: [ref(upstream)], incoming: [{ dependent: ref(member),
      disposition: { kind: "replace", replacementTargets: [ref(upstream)] } }],
  });
  await h.handEdit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")), writeMetaDependsOn(member.content, ["unrelated-upstream"]));
  const replacement = await h.seedStub("member-b");
  await h.handEdit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")), writeMetaDependsOn(member.content, ["unrelated-upstream", "member-b"]));
  const selected = lifecycleSuccess(await h.store.lookup({ kind: "lineage", origin: "member-b" }));
  expect(selected.reference.owner).toMatchObject({ uid: ref(unrelated).uid });
  await dropOldProvider(h);
  expect(lifecycleSuccess(await readWorkUnit(h.store, "member-b"))).toEqual(replacement);
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "member-a")))).dependsOn).toEqual(["unrelated-upstream", "member-b"]);
});
