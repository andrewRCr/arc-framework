/** Production cut admission binds native observations and inventories through publication. */
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { describe, expect, it } from "vitest";
import { nativeDecomposeFixture } from "../helpers/store/ref-decompose.js";
import { success } from "../helpers/store/suite-tools.js";
import { runStoreDecomposeAdditive } from "../../src/lib/decompose/additive.js";
import { runStoreDecomposeFinish } from "../../src/lib/decompose/finish.js";
import { runStoreDecomposeDiscard } from "../../src/lib/decompose/discard.js";
import { prepareDecomposePreflight } from "../../src/lib/decompose/preflight.js";
import { completeCutMapFixture } from "../fixtures/decompose-v4.js";
import { recordReferences } from "../../src/lib/store/index.js";
import { readWorkUnit } from "../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../src/lib/store/kinds/meta/writers.js";
import { fileDecomposeConflict, resolveDecomposeConflict } from "../fixtures/decompose-conflict.js";

async function finishPreview(h: Awaited<ReturnType<typeof nativeDecomposeFixture>>) {
  const preview = await runStoreDecomposeFinish(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  return preview.result;
}

async function reboundMap(h: Awaited<ReturnType<typeof nativeDecomposeFixture>>) {
  const prepared = await prepareDecomposePreflight(h.ctx, "origin");
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  return completeCutMapFixture(prepared.result.machine);
}

describe.each(["default", "separate"] as const)("production native cut admission in %s", layout => {
  it.each(["retire-edit", "retire-conflict", "extract-edit", "extract-conflict"] as const)("refuses a read-only %s at the final layout boundary and applies after repair", async scenario => {
    const mode = scenario.endsWith("edit") ? "edit" : "conflict";
    const h = await nativeDecomposeFixture(layout, { terminal: true, extraction: scenario.startsWith("extract") });
    const preview = await finishPreview(h);
    const primary = success(await readWorkUnit(h.store, "member-a"));
    const draft = success(await h.store.read({ reference: recordReferences["work-item/draft"](primary.reference.owner) }));
    let competing: unknown;
    const injected = h.compete(async () => {
      if (mode === "edit") await h.handEdit(draft, draft.content.replace("## Scope", "## Changed"));
      else {
        const result = await fileDecomposeConflict(h.store, draft);
        expect(result.subject.version).toBe(draft.version);
        expect(result.subject.conflicts).toHaveLength(1);
      }
      competing = success(await h.store.version());
    });
    expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.applyAuthority }))
      .toMatchObject({ status: "refused", remedy: { text: expect.any(String) } });
    injected();
    expect(success(await h.store.version())).toBe(competing);
    if (mode === "edit") await h.handEdit(success(await h.store.read({ reference: draft.reference })), draft.content);
    else await resolveDecomposeConflict(h.store, draft);
    const fresh = await finishPreview(h);
    expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: fresh.applyAuthority }))
      .toMatchObject({ status: "ok", result: { kind: "applied" } });
  });

  it.each(["existing", "new"] as const)("refuses a relevant %s incoming dependent at final admission and accepts a rebound map", async mode => {
    const h = await nativeDecomposeFixture(layout);
    const outsider = mode === "existing" ? await h.seedMeta("late-dependent") : undefined;
    let competing: unknown;
    const injected = h.compete(async () => {
      if (outsider) await h.handEdit(outsider, writeMetaDependsOn(outsider.content, ["origin"]));
      else await h.seedMeta("late-dependent", { dependsOn: ["origin"] });
      competing = success(await h.store.version());
    });
    const input = { cutMap: h.map, cutMapPath: "cut.json" };
    expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", input)).toMatchObject({ status: "refused" });
    injected();
    expect(success(await h.store.version())).toBe(competing);
    expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { ...input, cutMap: await reboundMap(h) }))
      .toMatchObject({ status: "ok" });
  });

  it("refuses a newly resolvable outgoing provider and completes after rebinding its generation", async () => {
    const h = await nativeDecomposeFixture(layout, { unknownProvider: true });
    expect(h.map.machine.outgoingEdges[0]?.provider.uid).toBeUndefined();
    let competing: unknown;
    const injected = h.compete(async () => {
      await h.seedMeta("late-provider");
      competing = success(await h.store.version());
    });
    expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" }))
      .toMatchObject({ status: "refused" });
    injected();
    expect(success(await h.store.version())).toBe(competing);
    const map = await reboundMap(h);
    expect(map.machine.outgoingEdges[0]?.provider.uid).toBeDefined();
    expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" }))
      .toMatchObject({ status: "ok" });
  });

  it("refuses a source companion added before its ref lock and completes with reacquired source units", async () => {
    const h = await nativeDecomposeFixture(layout);
    if (h.primary.reference.owner.type !== "work-item") throw new Error("Expected an origin UID");
    let competing: unknown;
    const injected = h.compete(async () => {
      await h.seed(recordReferences["work-item/notes"](h.primary.reference.owner), "");
      competing = success(await h.store.version());
    }, `refs/arc/history/work/${h.primary.reference.owner.uid}`);
    expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" }))
      .toMatchObject({ status: "refused" });
    injected();
    expect(success(await h.store.version())).toBe(competing);
    const map = await reboundMap(h);
    const emptySources = new Set(map.machine.sourceUnits.filter(unit => unit.sourceLocator.artifact === "notes-origin.md").map(unit => unit.sourceId));
    for (const allocation of map.authoring.sourceAllocations) if (emptySources.has(allocation.sourceId))
      allocation.disposition = { kind: "drop", reason: "The empty companion holds no retained work." };
    expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" }))
      .toMatchObject({ status: "ok" });
  });

  it("preserves a companion added to a removal group and requires fresh discard approval", async () => {
    const h = await nativeDecomposeFixture(layout, { terminal: true });
    const preview = await runStoreDecomposeDiscard(h.ctx, "origin");
    if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
    const member = success(await readWorkUnit(h.store, "member-b"));
    if (member.reference.owner.type !== "work-item") throw new Error("Expected a member UID");
    let competing: unknown;
    const injected = h.compete(async () => {
      await h.seed(recordReferences["work-item/notes"](member.reference.owner), "");
      competing = success(await h.store.version());
    }, `refs/arc/history/work/${member.reference.owner.uid}`);
    expect(await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
      .toMatchObject({ status: "refused" });
    injected();
    expect(success(await h.store.version())).toBe(competing);
    for (const reference of preview.result.removals) expect((await h.store.read({ reference })).status).toBe("ok");
    const fresh = await runStoreDecomposeDiscard(h.ctx, "origin");
    if (fresh.status === "refused" || fresh.result.kind !== "preview") throw new Error(JSON.stringify(fresh));
    expect(await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: fresh.result.applyAuthority }))
      .toMatchObject({ status: "ok", result: { kind: "discarded" } });
  });

  it("preserves a specific missing-object refusal and applies the same authority after object restoration", async () => {
    const h = await nativeDecomposeFixture(layout, { terminal: true });
    const preview = await finishPreview(h);
    const primary = success(await readWorkUnit(h.store, "member-a"));
    const evidence = primary;
    const home = expandStoredPath(evidence.reference);
    const args = h.gitDir ? [`--git-dir=${h.gitDir}`] : [];
    const oid = (await h.ports.exec("git", [...args, "rev-parse", `${home.ref}:${home.path}`], { cwd: h.root })).stdout.trim();
    const before = success(await h.store.version());
    const injected = h.compete(async () => { await removeLooseObject(h.root, oid, h.gitDir); });
    try {
      expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.applyAuthority }))
        .toMatchObject({ status: "refused", reason: "store", class: "recoverable", storeRefusal: {
          code: "state-unresolvable", reference: evidence.reference, condition: "The captured record blob is unavailable.",
          remedy: { text: expect.stringMatching(/restore or fetch/iu) },
        } });
      injected();
      expect(success(await h.store.version())).toBe(before);
    } finally {
      await h.ports.execInput([...args, "hash-object", "-w", "--stdin"], evidence.content, { cwd: h.root });
    }
    expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.applyAuthority }))
      .toMatchObject({ status: "ok", result: { kind: "applied" } });
  });

  it("admits an unrelated new owner at the final boundary using the original terminal approval", async () => {
    const h = await nativeDecomposeFixture(layout, { terminal: true });
    const preview = await finishPreview(h);
    const injected = h.compete(async () => { await h.seedMeta("unrelated"); });
    expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.applyAuthority }))
      .toMatchObject({ status: "ok", result: { kind: "applied" } });
    injected();
    expect(await readWorkUnit(h.store, "unrelated")).toMatchObject({ status: "ok" });
  });
});
