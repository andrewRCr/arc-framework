/** Seeded providers retain their generation when a retired name is reused. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readWorkUnit, readLifecycleMetaFields } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { checkDecomposeSeededFields } from "../../../../src/lib/decompose/check-seeded-fields.js";
import { projectDecomposeRevisionSeeds } from "../../../../src/lib/decompose/revision-seeds.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";

async function fixture() {
  const h = await createDecomposeTerminalFixture({ provider: true });
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
    { sourceSlug: "provider", targetSlug: "retired-provider" })).toMatchObject({ status: "renamed" });
  for (const primary of [member, origin]) {
    const current = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
    await h.handEdit(current, writeMetaDependsOn(current.content, []));
  }
  const tail = await h.seedStub("tail");
  const ref = (record: StoreRecord) => {
    const owner = record.reference.owner;
    if (owner.type !== "work-item" || owner.uid === undefined) throw Error("Expected generation.");
    return { name: owner.name, uid: owner.uid };
  };
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "retired-provider")), {
    kind: "decompose", successors: [ref(tail)], incoming: [member, origin].map(primary => ({ dependent: ref(primary),
      disposition: { kind: "replace", replacementTargets: [ref(tail)] } })),
  });
  await h.seedStub("provider");
  const current = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  await h.handEdit(current, writeMetaDependsOn(current.content, ["provider"]));
  return h;
}

it("requires the original provider's assigned retirement disposition after a different generation takes its name", async () => {
  const h = await fixture();
  const input = await acquireDecomposeTerminal(h.ctx, "origin");
  if (input.status === "refused") throw Error(JSON.stringify(input));
  expect(await checkDecomposeSeededFields(h.ctx, input.result)).toMatchObject({ status: "refused", reason: "seed-divergence" });
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  await h.handEdit(member, writeMetaDependsOn(member.content, ["tail"]));
  const repaired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (repaired.status === "refused") throw Error(JSON.stringify(repaired));
  expect(await checkDecomposeSeededFields(h.ctx, repaired.result)).toMatchObject({ status: "ok" });
});

it("preserves an unrelated replacement generation when a revision drops the original seed", async () => {
  const h = await fixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const result = await projectDecomposeRevisionSeeds(h.store, h.map, member,
    { dependsOn: [], cohort: lifecycleSuccess(readLifecycleMetaFields(member)).cohort, addedSlugs: new Set() });
  expect(result).toMatchObject({ status: "ok", result: { content: member.content } });
});
