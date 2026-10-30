/** Surviving edges introduced at batch admission prevent partial removal. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runPause } from "../../../../src/lib/work-unit/verbs/pause-handover.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";

it.each([
  ["discard", "dependency"], ["discard", "pause"], ["revision", "dependency"], ["revision", "pause"],
] as const)("refuses %s when a surviving %s edge arrives inside batch admission, then admits repair", async (mode, edge) => {
  const h = await createDecomposeTerminalFixture();
  const outsider = edge === "dependency" ? await h.seedStub("outsider")
    : await h.seedMeta("outsider", { state: "Active", currentWorkflow: "process-task-loop" });
  const removed = SlugSchema.parse(mode === "discard" ? "member-a" : "member-b");
  const map = JSON.parse(JSON.stringify(h.map).replaceAll('"member-b"', '"member-c"'));
  const run = (applyAuthority?: string) => mode === "discard"
    ? runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority })
    : runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority });
  const pause = { store: h.store, cwd: "/repo", baseBranch: "main", now: () => new Date("2026-10-19T00:00:00Z"),
    locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) },
    exec: scriptGitExec([{ match: ["remote"], responses: [{ stdout: "" }, { stdout: "" }] }]).exec };
  const preview = await run();
  if (preview.status !== "ok" || preview.result.kind !== "preview") throw Error(JSON.stringify(preview));
  let competedVersion: unknown;
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    if (edge === "dependency") await h.handEdit(outsider, writeMetaDependsOn(outsider.content, [removed]));
    else expect(await runPause(pause, { name: "outsider", identity: h.ctx.identity,
      reason: "Waiting for the member.", waitsOn: removed })).toMatchObject({ status: "paused" });
    competedVersion = lifecycleSuccess(await h.store.version());
  });
  expect(await run(preview.result.applyAuthority)).toMatchObject({ status: "refused", reason: "store",
    storeRefusal: { code: "record-malformed", rule: "meta.decompose-removal-edges",
      condition: expect.stringContaining("outsider") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(competedVersion);
  expect(await h.store.lookup({ kind: "slug", slug: removed })).toMatchObject({ status: "ok" });
  expect(await h.store.read({ reference: h.applied.storedMap })).toMatchObject({ status: "ok" });
  expect(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("member-c") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  if (edge === "dependency") {
    const current = lifecycleSuccess(await readWorkUnit(h.store, "outsider"));
    await h.handEdit(current, writeMetaDependsOn(current.content, []));
  } else expect(await runPause(pause, { name: "outsider", identity: h.ctx.identity, waitsOn: false })).toMatchObject({ status: "paused" });
  const repaired = await run();
  if (repaired.status !== "ok" || repaired.result.kind !== "preview") throw Error(JSON.stringify(repaired));
  expect(await run(repaired.result.applyAuthority)).toMatchObject({ status: "ok",
    result: { kind: mode === "discard" ? "discarded" : "revised" } });
});
