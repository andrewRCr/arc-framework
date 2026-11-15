import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { indexOfSoftWrappedProse, softWrappedPattern, softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

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

function section(start: string, end: string): string {
  return workflow.slice(workflow.indexOf(start), workflow.indexOf(end));
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
    expect(workflow).toMatch(
      softWrappedPattern(/status,\s+reason,\s+optional\s+locus\s+and\s+evidence,\s+remedy,\s+and\s+any\s+optional\s+report\s+unchanged/u),
    );
    expect(workflow).toMatch(
      softWrappedProse(
        "Successful preflight writes the starter map alone; refusal follows the common envelope and never emits a partial starter map.",
      ),
    );
    expect(workflow).toMatch(softWrappedProse("Never construct identifiers, record references, apply authorities"));
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
    expect(workflow).toMatch(softWrappedProse("naming `--finish` for a fresh preview, which returns to step 5's approval"));
  });

  it("previews a discard or revision at a stop of its own before applying it", () => {
    const options = section("A rejection runs the discard instead", "## 6. Apply the terminal batch");
    const stop = options.indexOf("`workflow-interlock`");
    const discardApply = options.indexOf("arc decompose <origin> --discard --apply <applyAuthority>");
    const revisionApply = options.indexOf("arc decompose <origin> --revise <revised-map> --apply <applyAuthority>");

    expect(options).toContain("`arc decompose <origin> --discard`");
    expect(options).toContain("`leftEdited`");
    expect(options).toContain("`arc decompose <origin> --revise > <scratch-revision-starter>`");
    expect(options).toContain("`carried`");
    expect(options).toContain("`reauthor`");
    expect(stop).toBeGreaterThan(-1);
    expect(options.slice(stop, discardApply)).toMatch(softWrappedProse("explicit 'apply' direction"));
    expect(discardApply).toBeGreaterThan(stop);
    expect(revisionApply).toBeGreaterThan(stop);
    expect(options).toMatch(softWrappedProse("authoring resumes at step 4 for what the revision added"));
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
      expect(refusal).toContain("surface its status, reason, optional locus and evidence, remedy");
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
