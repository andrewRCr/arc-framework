import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { acquireDecomposeOrigin } from "../../../src/lib/decompose/acquire-origin.js";
import { runStoreDecomposeFinish } from "../../../src/lib/decompose/finish.js";
import { runStoreDecomposePreflight } from "../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeRevisionStarter } from "../../../src/lib/decompose/revision-starter.js";
import { runStoreDecomposeRevision } from "../../../src/lib/decompose/revision.js";
import { copyDecomposeArtifact } from "../../../src/lib/decompose/scaffold-copy.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { readWorkUnit } from "../../../src/lib/store/lifecycle-write.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import type { CutMap } from "../../../src/lib/decompose/cut-map-schema.js";
import { decomposeContext } from "../../fixtures/decompose-context.js";
import { createDecomposeExtractionFixture } from "../../fixtures/decompose-extraction.js";
import { createDecomposeOriginFixture } from "../../fixtures/decompose-origin.js";
import { createDecomposeTerminalFixture } from "../../fixtures/decompose-terminal.js";
import { indexOfSoftWrappedProse, softWrappedPattern, softWrappedProse } from "../../helpers/soft-wrapped-prose.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";

const workflow = readFileSync(
  new URL("../../../arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md", import.meta.url),
  "utf8",
);
const projectWorkflow = readFileSync(
  new URL("../../../../../.arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md", import.meta.url),
  "utf8",
);

const PREVIEW = "arc decompose <origin> --finish";
const APPLY = "arc decompose <origin> --finish --apply <applyAuthority>";
const REVISION_PREVIEW = "`arc decompose <origin> --revise <revised-map>`";

function section(start: string, end: string): string {
  return workflow.slice(workflow.indexOf(start), workflow.indexOf(end));
}

async function applyRevision(ctx: ReturnType<typeof decomposeContext>, map: CutMap): Promise<void> {
  const input = { cutMap: map, cutMapPath: "revised.json" };
  const preview = await runStoreDecomposeRevision(ctx, "origin", input);
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeRevision(ctx, "origin", input, { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
}

describe("decompose workflow contract", () => {
  it("orders the stored cut's lifecycle", () => {
    const headings = [
      "## 1. Emit the exact preflight",
      "## 2. Complete the operator-owned map",
      "## 3. Write the additive batch",
      "## 4. Author every reported destination",
      "## 5. Preview and approve the distribution",
      "## 6. Apply the terminal batch",
      "## 7. Confirm lifecycle readiness",
    ];
    const positions = headings.map((heading) => workflow.indexOf(heading));

    expect(positions).not.toContain(-1);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("defines one all-mode refusal envelope and preserves its actionable fields", () => {
    expect(workflow.match(softWrappedPattern(/Every\s+selected\s+mode\s+emits\s+one\s+typed\s+refusal\s+envelope\s+on\s+stdout\./gu))).toHaveLength(1);
    expect(workflow).toMatch(softWrappedProse("On refusal, surface the complete typed refusal envelope unchanged"));
    expect(workflow).toMatch(
      softWrappedProse(
        "Successful preflight writes the starter map alone; refusal follows the common envelope and never emits a partial starter map.",
      ),
    );
    expect(workflow).toMatch(softWrappedProse("Never construct identifiers, record references, apply authorities"));
  });

  it("preserves the diagnostic a refused task-list copy needs for repair", async () => {
    const h = await createDecomposeOriginFixture(true);
    const member = await h.seedStub("member");
    const tasks = "# Tasks origin\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Work**\n";
    await h.seed(recordReferences["work-item/task-list"](h.primary.reference.owner), tasks);
    const acquired = await acquireDecomposeOrigin(h.ctx, "origin");
    if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
    const source = acquired.result.artifacts.find(artifact => artifact.basename === "tasks-origin.md")!;
    source.record.content = tasks.replace("## **Phase 1:** Work", "## **Phase 1:** Work\n\n_Mode:_ `layer`");
    const refusal = copyDecomposeArtifact(h.ctx, acquired.result, member.reference.owner, source.basename);
    expect(refusal).toMatchObject({
      status: "refused", reason: "scaffold-task-list", class: "recoverable",
      remedy: { text: expect.stringContaining("Repair each named diagnostic") },
      message: expect.stringContaining("task-list.segmentation"),
    });
    source.record.content = tasks;
    expect(copyDecomposeArtifact(h.ctx, acquired.result, member.reference.owner, source.basename))
      .toMatchObject({ status: "ok" });

    const instruction = section("On refusal,", "Never construct");
    expect(instruction).toMatch(softWrappedPattern(/(?:complete|full|entire)\s+(?:typed\s+)?refusal\s+envelope/u));
    expect(instruction).toMatch(/\b(?:unchanged|verbatim)\b/u);
  });

  it("recovers current allocations before authoring without the additive report", async () => {
    const { store, map } = await createDecomposeTerminalFixture({ withHome: true });
    const ctx = decomposeContext(store);
    expect(await runStoreDecomposePreflight(ctx, "origin")).toMatchObject({
      status: "refused", reason: "cut-in-flight",
      remedy: { text: expect.stringContaining("arc decompose origin --revise") },
    });

    const starter = await runStoreDecomposeRevisionStarter(ctx, "origin");
    if (starter.status === "refused") throw new Error(JSON.stringify(starter));
    expect(JSON.parse(starter.result)).toMatchObject({ status: "carried", map: { authoring: map.authoring } });

    const resume = section("## 1. Emit the exact preflight", "## 2. Complete the operator-owned map");
    expect(resume).toMatch(softWrappedPattern(/`--revise`\s+without\s+a\s+map/u));
    expect(resume).toMatch(softWrappedPattern(/`carried\.map`[^.]*step\s+4/u));
    expect(resume).toMatch(softWrappedPattern(/`reauthor`[^.]*`storedAuthoring`/u));
    expect(resume).toMatch(softWrappedPattern(/revision\s+preview\s+and\s+approval/u));
  });

  it("recovers a withdrawn home allocation after successive revisions and a session restart", async () => {
    const h = await createDecomposeTerminalFixture({ withHome: true });
    const home = lifecycleSuccess(await readWorkUnit(h.store, "home"));
    const reference = recordReferences["work-item/draft"](home.reference.owner);
    const before = lifecycleSuccess(await h.store.read({ reference }));
    const authored = await h.handEdit(before, `${before.content}\n## Scope\n\nOwned work.\n`);
    const revised = structuredClone(h.map);
    revised.authoring.shape = "symmetric";
    revised.authoring.destinations = revised.authoring.destinations.filter(destination => destination.destinationId !== "z-home");
    revised.authoring.sourceAllocations[0]!.disposition = { kind: "drop", reason: "The existing home owns none of this cut." };
    await applyRevision(h.ctx, revised);
    await applyRevision(h.ctx, revised);
    expect(lifecycleSuccess(await h.store.read({ reference }))).toEqual(authored);

    const fresh = decomposeContext(h.store);
    fresh.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" }) };
    const starter = await runStoreDecomposeRevisionStarter(fresh, "origin");
    if (starter.status === "refused") throw new Error(JSON.stringify(starter));
    expect(JSON.parse(starter.result)).toMatchObject({ status: "carried", map: revised, previousMaps: [h.map] });
    const authoring = section("## 4. Author every reported destination", "## 5. Preview and approve the distribution");
    expect(authoring).toMatch(softWrappedPattern(/compare[^.]*`previousMaps`[^.]*current\s+map/iu));
    expect(authoring).toMatch(softWrappedPattern(/remove[^.]*withdrawn\s+obligations[^.]*surviving\s+former\s+destinations/iu));

    await h.handEdit(authored, before.content);
    const finish = await runStoreDecomposeFinish(fresh, "origin");
    if (finish.status === "refused" || finish.result.kind !== "preview") throw new Error(JSON.stringify(finish));
    expect(await runStoreDecomposeFinish(fresh, "origin", { applyAuthority: finish.result.applyAuthority }))
      .toMatchObject({ status: "ok", result: { kind: "applied" } });
    expect(lifecycleSuccess(await h.store.read({ reference })).content).toBe(before.content);
  });

  it("keeps the origin's name reserved at cohort creation and routes a later rename to revision", () => {
    const map = section("## 2. Complete the operator-owned map", "## 3. Write the additive batch");
    expect(map).toMatch(softWrappedPattern(/cohort[^.]*cannot\s+take\s+the\s+origin's\s+name/u));
    expect(map).toContain("`arc rename <slug> <new-slug>`");
    expect(map).toMatch(softWrappedPattern(/in-flight\s+cut[^.]*`--revise`[^.]*placement/u));
  });

  it("makes the distribution approval the one stop before the terminal batch", () => {
    const authoring = workflow.indexOf("## 4. Author every reported destination");
    const preview = workflow.indexOf(`${PREVIEW}\n`);
    const apply = workflow.indexOf(APPLY);
    const interlocks = [...workflow.matchAll(/`workflow-interlock`/gu)];

    expect(interlocks).toHaveLength(2);
    expect(preview).toBeGreaterThan(authoring);
    expect(interlocks[0]!.index).toBeGreaterThan(preview);
    expect(apply).toBeGreaterThan(interlocks[1]!.index);
    expect(workflow).toMatch(softWrappedProse("This is the sole semantic distribution approval, and it authorizes the terminal batch."));
    expect(workflow).toMatch(softWrappedProse("Right after approval, in the same session, apply the exact preview"));
    expect(workflow).toMatch(softWrappedProse("A stale authority refusal names `--finish` for a fresh preview"));
  });

  it("routes a landed bare finish to remaining work before the preview interlock", () => {
    const beforeApproval = section(`${PREVIEW}\n`, "`workflow-interlock`");
    const landed = beforeApproval.match(/- \*\*`landed`\*\*[\s\S]*?(?=\n- )/u)?.[0];
    expect(landed).toMatch(softWrappedPattern(/skip\s+preview\s+approval[^.]*apply/iu));
    expect(landed).toMatch(softWrappedPattern(/reconciliation[^.]*cohort\s+upkeep[^.]*readiness/u));
  });

  it("checks the current origin state for the selected shape and revises changed bindings", () => {
    const beforeApproval = section(`${PREVIEW}\n`, "`workflow-interlock`");
    expect(beforeApproval).toMatch(softWrappedPattern(/current\s+state[^.]*eligible[^.]*shape/u));
    expect(beforeApproval).toMatch(softWrappedPattern(/`Planning`[^.]*`Active`[^.]*extraction/u));
    expect(beforeApproval).toMatch(softWrappedPattern(/source\s+units[^.]*dependency\s+edges[^.]*`--revise`/u));
    expect(beforeApproval).toMatch(softWrappedPattern(/renamed\s+origin[^.]*`--revise`[^.]*current\s+name/u));
  });

  it("requires a new destination review before approval when an allocated specification body changes", async () => {
    const h = await createDecomposeExtractionFixture();
    const preview = await runStoreDecomposeFinish(h.ctx, "origin");
    if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
    const reference = recordReferences["work-item/companion"](h.member.reference.owner, "spec-rfc");
    const reviewed = lifecycleSuccess(await h.store.read({ reference }));
    await h.handEdit(reviewed, `${reviewed.content}\nThe member must reject incomplete transfers.\n`);

    expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
      .toMatchObject({ status: "refused", reason: "stale-apply-authority", remedy: { argv: ["arc", "decompose", "origin", "--finish"] } });
    const fresh = await runStoreDecomposeFinish(h.ctx, "origin");
    if (fresh.status === "refused" || fresh.result.kind !== "preview") throw new Error(JSON.stringify(fresh));
    expect(fresh.result.applyAuthority).not.toBe(preview.result.applyAuthority);
    expect(await runStoreDecomposeFinish(h.ctx, "origin", { applyAuthority: fresh.result.applyAuthority }))
      .toMatchObject({ status: "ok", result: { kind: "applied" } });

    const retry = section(APPLY, "- **`applied`**");
    expect(retry).toMatch(softWrappedProse("`--finish` for a fresh preview"));
    expect(retry).toMatch(softWrappedPattern(/compare[^.]*destination\s+specifications[^.]*reviewed/u));
    expect(retry).toMatch(softWrappedPattern(/step\s+4[^.]*review[^.]*substantive\s+edits/u));
    expect(retry).toMatch(softWrappedPattern(/before\s+renewed\s+approval[^.]*compare/iu));
    expect(retry).toMatch(softWrappedProse("Reuse completed reviews for unchanged content"));
  });

  function assertDiscardAndRevisionContract(options: string): void {
    const stop = options.indexOf("`workflow-interlock`");
    const revisionPreview = options.indexOf(REVISION_PREVIEW);
    const discardApply = options.indexOf("arc decompose <origin> --discard --apply <applyAuthority>");
    const revisionApply = options.indexOf("arc decompose <origin> --revise <revised-map> --apply <applyAuthority>");

    expect(options).toContain("`arc decompose <origin> --discard`");
    expect(options).toContain("`leftEdited`");
    expect(options).toContain("`arc decompose <origin> --revise > <scratch-revision-starter>`");
    expect(options).toContain("`carried`");
    expect(options).toContain("`reauthor`");
    expect(stop).toBeGreaterThan(-1);
    expect(revisionPreview).toBeGreaterThanOrEqual(0);
    expect(revisionPreview).toBeLessThan(stop);
    expect(options.slice(stop, discardApply)).toMatch(softWrappedProse("explicit 'apply' direction"));
    expect(discardApply).toBeGreaterThan(stop);
    expect(revisionApply).toBeGreaterThan(stop);
    expect(options.slice(revisionApply)).toMatch(softWrappedProse("resume step 4 from the approved revised map"));
  }

  it("previews a discard or revision at a stop of its own before applying it", () => {
    assertDiscardAndRevisionContract(section("A rejection runs the discard instead", "## 6. Apply the terminal batch"));
  });

  it("detects a missing map-bearing revision preview even if the apply remains", () => {
    const options = section("A rejection runs the discard instead", "## 6. Apply the terminal batch");
    expect(options).toContain(REVISION_PREVIEW);
    expect(() => assertDiscardAndRevisionContract(options.replace(REVISION_PREVIEW, ""))).toThrow();
  });

  it("reports current discard targets and surviving edits as separate evidence", () => {
    const preview = section("- **Discard.**", "- **Revision.**");
    const completion = section("After a discard,", "## 6. Apply the terminal batch");
    for (const report of [preview, completion]) {
      expect(report).toMatch(softWrappedPattern(/`leftEdited`[^.]*current\s+map/u));
    }
    expect(completion).toMatch(softWrappedPattern(/separately[^.]*authoring\s+edits[^.]*dependency\s+settlements[^.]*`records`/iu));
  });

  it("authors the replacement after reassignment removes the former document group", async () => {
    const h = await createDecomposeTerminalFixture();
    const removed = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
    const design = recordReferences["work-item/draft"](removed.reference.owner);
    lifecycleSuccess(await h.store.read({ reference: design }));
    const revised = structuredClone(h.map);
    const former = revised.authoring.destinations[0];
    if (former?.kind !== "new-member") throw new Error("Expected a new member.");
    former.slug = "member-c";
    for (const allocation of revised.authoring.sourceAllocations) {
      if (allocation.disposition.kind === "target") allocation.disposition.targetLocator.artifact = "draft-member-c.md";
    }
    revised.authoring.internalEdges = [{ from: "member-c", to: "member-b" }];
    for (const edge of revised.authoring.incomingDispositions) {
      if (edge.disposition.kind === "replace") edge.disposition.replacementTargets = ["member-c"];
    }
    await applyRevision(h.ctx, revised);
    expect(await h.store.read({ reference: design })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const replacement = lifecycleSuccess(await readWorkUnit(h.store, "member-c"));
    lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](replacement.reference.owner) }));

    const resume = section("arc decompose <origin> --revise <revised-map> --apply <applyAuthority>",
      "## 6. Apply the terminal batch");
    expect(resume).toMatch(softWrappedPattern(/step\s+4[^.]*approved\s+revised\s+map/u));
    const authoring = section("## 4. Author every reported destination", "## 5. Preview and approve the distribution");
    expect(`${resume}\n${authoring}`).not.toMatch(softWrappedPattern(/reassignments?[^.]*update\s+both\s+destinations/iu));
    expect(authoring).toMatch(softWrappedPattern(/skip[^.]*removed\s+destinations/iu));
    expect(authoring).toMatch(softWrappedPattern(/author[^.]*replacement[^.]*current\s+map/iu));
  });

  it("reviews an extraction's retained content at the distribution gate", () => {
    const review = section("## 5. Preview and approve the distribution", "A rejection runs the discard instead");
    const specReview = review.indexOf("[spec-review][spec-review]");
    const stop = review.indexOf("`workflow-interlock`");

    expect(review).toContain("`retainedContent`");
    expect(review).toContain("`lineage`");
    expect(review).toContain("`removals`");
    expect(specReview).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(specReview);
    expect(review).toMatch(softWrappedProse("surviving origin as the natural continuation"));
    expect(review).toMatch(softWrappedProse("never re-derive them from records"));
  });

  it("carries companion allocation and copy authoring through both workflow copies", () => {
    for (const candidate of [workflow, projectWorkflow]) {
      const mapStart = candidate.indexOf("## 2. Complete the operator-owned map");
      const batchStart = candidate.indexOf("## 3. Write the additive batch");
      const authorStart = candidate.indexOf("## 4. Author every reported destination");
      const previewStart = candidate.indexOf("## 5. Preview and approve the distribution");
      const map = candidate.slice(mapStart, batchStart).replace(/\s+/gu, " ");
      const authoring = candidate.slice(authorStart, previewStart).replace(/\s+/gu, " ");

      expect(map).toContain("inventoried companion units");
      expect(map).toContain("task-list phases and notes sections");
      expect(map).toContain("same target or reasoned-drop dispositions as design units");
      expect(map).toContain("started-Planning companion allocation to `retained-origin`");
      expect(map).toContain("Active origins report no companion units");
      expect(map).toContain("its Purpose");
      expect(authoring).toContain("whole retitled copy of the origin's companion");
      expect(authoring).toContain("prune it to its assigned content");
      expect(authoring).toContain("manually transfer allocated content from every other companion");
      expect(authoring).toContain("keep each member's seeded `Cohort` and `Depends On`");
    }
  });

  it("routes external-edge authoring without losing cumulative workflow guidance", () => {
    for (const candidate of [workflow, projectWorkflow]) {
      const refusalStart = indexOfSoftWrappedProse(candidate, "Use only CLI-reported paths, packets, statuses, and remedies");
      const preconditionsStart = candidate.indexOf("## Preconditions");
      const mapStart = candidate.indexOf("## 2. Complete the operator-owned map");
      const batchStart = candidate.indexOf("## 3. Write the additive batch");
      const refusal = candidate.slice(refusalStart, preconditionsStart).replace(/\s+/gu, " ");
      const map = candidate.slice(mapStart, batchStart).replace(/\s+/gu, " ");

      expect(refusalStart).toBeGreaterThan(-1);
      expect(refusal).toContain("surface the complete typed refusal envelope unchanged");
      expect(refusal).toContain("Stop until the reported correction is complete");
      expect(map).toContain("`externalEdges`");
      expect(map).toContain("new member or live existing-home work unit");
      expect(map).toContain("work unit outside the cut");
      expect(map).toContain("`internalEdges`");
      expect(map).toContain("`outgoingDispositions`");
      expect(candidate).not.toMatch(/\bnpx\s+arc\b/u);
    }
  });

  it("runs a closed retirement/extraction dispatch through the stored cut", () => {
    const bashCommands = [...workflow.matchAll(/```bash\n([\s\S]*?)```/gu)].map(
      (match) => match[1]!.trim(),
    );

    expect(bashCommands).toEqual([
      "arc decompose <origin> --preflight > <scratch-starter-map>",
      "arc decompose <origin> --execute <completed-map>",
      "arc decompose <origin> --extract <completed-map>",
      "arc save",
      PREVIEW,
      "arc decompose <origin> --discard --apply <applyAuthority>",
      "arc decompose <origin> --revise <revised-map> --apply <applyAuthority>",
      APPLY,
      "arc save",
      "arc status --project",
    ]);
    expect(workflow).toContain("`arc schema get cut-map`");
    expect(workflow).toMatch(softWrappedProse("no later mode takes the map file"));
    for (const retired of ["--advance-base", "--finalize", "--continuation", "--handoff", "<completed-map> --apply"]) {
      expect(workflow).not.toContain(retired);
    }
  });

  it("lands through the terminal batch with no Git release", () => {
    expect(workflow).toMatch(softWrappedProse("The terminal batch is the landing: no commit, push, pull request, or merge follows."));
    for (const control of ["`commit-interlock`", "`push-interlock`", "`integration-interlock`", "`workflowCommit`",
      "`workflowPush`", "git add", "gh pr", "arc teardown --branch"]) {
      expect(workflow).not.toContain(control);
    }
    expect(workflow).not.toMatch(/\bgit\s+(?:branch|checkout|commit|switch|worktree|update-ref|write-tree)\b/iu);
    expect(workflow).toMatch(softWrappedProse("a `continuation` names a cleanup step that did not complete"));
    expect(workflow).toMatch(softWrappedProse("**`landed`** reports a cut that had already landed"));
  });

  it("checks each authored increment before saving it", () => {
    const saves = [...workflow.matchAll(/```bash\narc save\n```/gu)].map((match) => match.index);
    const checks = [...workflow.matchAll(/Run `arc check increment` over/gu)].map((match) => match.index);

    expect(saves).toHaveLength(2);
    expect(checks).toHaveLength(2);
    expect(checks[0]).toBeLessThan(saves[0]!);
    expect(checks[1]).toBeGreaterThan(saves[0]!);
    expect(checks[1]).toBeLessThan(saves[1]!);
  });

  it.each([
    ["distribution preview", "Run `arc check increment` over the authored destinations", "## 5. Preview and approve the distribution"],
    ["lifecycle readiness", "Run `arc check increment` over these edits", "## 7. Confirm lifecycle readiness"],
  ])("requires the store to accept the edited files before %s", (_next, start, end) => {
    const instructions = section(start, end).split("```bash\narc save\n```")[1];
    expect(instructions).toContain("`arc selection`");
    expect(instructions).toContain("`arc selection --changed`");
    expect(instructions).toMatch(softWrappedPattern(/each\s+file\s+edited\s+in\s+this\s+step/u));
    expect(instructions).toMatch(softWrappedPattern(/remed[^.]*recheck[^.]*save\s+again/u));
  });

  it("preserves extraction's no-lineage and surviving-origin boundary", () => {
    expect(workflow).toMatch(softWrappedProse("Extraction writes no lineage record: its origin survives."));
    expect(workflow).toMatch(softWrappedProse("It stores no launch advice, publication packet, or selected successor"));
    expect(workflow).toMatch(softWrappedProse("Never tear down the surviving extraction origin"));
    expect(workflow).toMatch(softWrappedProse("Retirement alone writes the origin's lineage record"));
  });

  it("reconciles the surviving extraction origin after the terminal batch", () => {
    const apply = workflow.indexOf(APPLY);
    const reconcile = indexOfSoftWrappedProse(workflow, "the surviving origin's owner then reconciles it");
    const save = workflow.lastIndexOf("arc save");
    const tail = workflow.slice(reconcile, save);

    expect(reconcile).toBeGreaterThan(apply);
    expect(tail).toMatch(softWrappedProse("surviving `tasks-{origin}.md`"));
    expect(tail).toContain("`**Next Task:**`");
    expect(tail).toContain("`**Next Action:**`");
    expect(tail).toMatch(softWrappedProse("both an `Active` origin and a started `Planning` origin"));
    expect(tail).toMatch(softWrappedProse("the record's next hand edit refuses while it stays"));
  });

  it("keeps package source and the self-hosted project projection byte-equal", () => {
    expect(projectWorkflow).toBe(workflow);
  });
});
