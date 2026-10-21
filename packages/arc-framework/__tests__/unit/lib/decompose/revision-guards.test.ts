/** Revision protects started members' decisions and retained cut identities. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn, writeMetaCohort } from "../../../../src/lib/store/kinds/meta/writers.js";

async function apply(h: Awaited<ReturnType<typeof createDecomposeTerminalFixture>>, map = h.map) {
  const preview = await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" });
  expect(preview.status).toBe("ok");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
}

it.each(["Depends On", "Cohort"] as const)("refuses moving a started member's %s and admits the owner's matching change", async field => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  lifecycleSuccess(await h.store.write({ ...recordPut(member, { placement: { kind: "active" } }), provenance: { verb: "start", lifecycleAction: "start" } }));
  const map = structuredClone(h.map);
  if (field === "Depends On") map.authoring.internalEdges = [];
  else {
    await h.seedCohort("other-group");
    map.authoring.placement = { kind: "cohort", cohort: "other-group" };
  }
  const before = lifecycleSuccess(await h.store.version());
  const refusal = await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" });
  expect(refusal).toMatchObject({ status: "refused", reason: "started-member-seed", locus: `member-a.${field}`,
    remedy: { text: expect.stringContaining("owner") } });
  if (refusal.status === "refused") {
    expect(refusal.remedy.text).toContain(field);
    expect(refusal.remedy.text).toContain("map");
  }
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await apply(h, h.map);
  const current = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(current, field === "Depends On" ? writeMetaDependsOn(current.content, []) : writeMetaCohort(current.content, "other-group"));
  await apply(h, map);
});

it("requires a renamed member's original name before revising and admits the native rename remedy", async () => {
  const h = await createDecomposeTerminalFixture();
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
    { sourceSlug: "member-b", targetSlug: "renamed-b" })).toMatchObject({ status: "renamed" });
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }))
    .toMatchObject({ status: "refused", reason: "member-renamed", remedy: { argv: ["arc", "rename", "renamed-b", "member-b"] } });
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
    { sourceSlug: "renamed-b", targetSlug: "member-b" })).toMatchObject({ status: "renamed" });
  await apply(h);
});

it.each([false, true])("requires dropping a gone member kept by the revision, reused=%s", async reused => {
  const h = await createDecomposeTerminalFixture();
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")));
  if (reused) await h.seedStub("member-a");
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }))
    .toMatchObject({ status: "refused", reason: "member-gone", locus: "member-a", remedy: { text: expect.stringContaining("map") } });
  const map = structuredClone(h.map);
  const first = map.authoring.destinations[0];
  if (first?.kind !== "new-member") throw new Error("Expected member.");
  first.slug = "member-c";
  map.authoring.internalEdges = [{ from: "member-c", to: "member-b" }];
  for (const allocation of map.authoring.sourceAllocations) if (allocation.disposition.kind === "target")
    allocation.disposition.targetLocator.artifact = "draft-member-c.md";
  for (const incoming of map.authoring.incomingDispositions) if (incoming.disposition.kind === "replace")
    incoming.disposition.replacementTargets = ["member-c"];
  await apply(h, map);
});

it.each(["group", "group/child"])("requires another cohort name when a revision would reparent cut-owned %s", async path => {
  const h = await createDecomposeTerminalFixture({ authorMap: map => {
    if (path.includes("/")) map.authoring.placement = { kind: "subcohort", cohort: path, purpose: "Coordinate children.", parentPurpose: "Coordinate the parent." };
  } });
  const leaf = path.split("/").at(-1) ?? path;
  const map = structuredClone(h.map);
  map.authoring.placement = { kind: "subcohort", cohort: `other/${leaf}`, purpose: "Coordinate revised children.", parentPurpose: "Coordinate the new parent." };
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }))
    .toMatchObject({ status: "refused", reason: "cohort-parent", locus: "authoring.placement.cohort", remedy: { text: expect.stringContaining("another name") } });
  map.authoring.placement = { kind: "subcohort", cohort: "other/new-child", purpose: "Coordinate revised children.", parentPurpose: "Coordinate the new parent." };
  await apply(h, map);
});
