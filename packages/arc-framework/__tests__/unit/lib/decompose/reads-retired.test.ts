/** Former-name resolution reads only selected retired providers as unrelated endings grow. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { createCountingStore } from "../../../helpers/store/counting-store.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { prepareDecomposeAdditive } from "../../../../src/lib/decompose/additive-plan.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { checkDecomposeSeededFields } from "../../../../src/lib/decompose/check-seeded-fields.js";
import { projectDecomposeRevisionSeeds } from "../../../../src/lib/decompose/revision-seeds.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";

async function measure(mode: "additive" | "terminal" | "revision", unrelated: number) {
  const h = mode === "additive" ? await createDecomposePlanFixture() : await createDecomposeTerminalFixture({ provider: true });
  for (let index = 0; index < unrelated; index++) await h.seedRetiredWorkUnit(`unrelated-${index}`);
  if (mode === "additive") {
    const provider = await h.seedRenamedWorkUnit("old-provider", "current-provider");
    await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["old-provider"] },
      { kind: "backlog", commitment: "planned" });
    await h.seedRetiredWorkUnit(provider);
  } else {
    expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
      { sourceSlug: "provider", targetSlug: "current-provider" })).toMatchObject({ status: "renamed" });
    await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "current-provider")));
    const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
    await h.handEdit(member, writeMetaDependsOn(member.content, []));
  }
  const counted = createCountingStore(h.store);
  h.ctx.executor.store = counted.store;
  if (mode === "additive") {
    const map = JSON.parse(JSON.stringify(h.map).replaceAll('"member-b"', '"old-provider"'));
    expect(await prepareDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" }))
      .toMatchObject({ status: "ok" });
  } else if (mode === "terminal") {
    const input = await acquireDecomposeTerminal(h.ctx, "origin");
    if (input.status === "refused") throw Error(JSON.stringify(input));
    expect(await checkDecomposeSeededFields(h.ctx, input.result)).toMatchObject({ status: "ok" });
  } else {
    const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
    expect(await projectDecomposeRevisionSeeds(counted.store, h.map, member,
      { dependsOn: [], cohort: null, addedSlugs: new Set() })).toMatchObject({ status: "ok" });
  }
  const calls = counted.observations();
  const unrelatedReads = calls.filter(call => call.operation === "history" && call.input.reference.owner.name.startsWith("unrelated-"));
  expect(unrelatedReads).toEqual([]);
  expect(calls.filter(call => call.operation === "list" && call.input.family === "lineage")).toEqual([]);
  return calls.filter(call => call.operation === "history").map(call => call.input.reference.owner.name).sort();
}

it.each(["additive", "terminal", "revision"] as const)("keeps %s former-provider reads bounded with unrelated retirements", async mode => {
  expect(await measure(mode, 6)).toEqual(await measure(mode, 0));
});
