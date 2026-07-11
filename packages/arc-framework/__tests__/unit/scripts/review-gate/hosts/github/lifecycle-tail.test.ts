import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../../../../src/lib/git/exec.js";
import type { LifecycleTailProofResolutionInput } from "../../../../../../src/scripts/review-gate/core/ports.js";
import { GitLifecycleTailProofAdapter } from "../../../../../../src/scripts/review-gate/hosts/github/lifecycle-tail.js";

const REVIEWED = "a".repeat(40);
const CURRENT = "b".repeat(40);
const DIFF_BASE = "c".repeat(40);
const POLICY = "d".repeat(64);
const SLUG = "review-gate";
const ACTIVE = ".arc/active";
const ARCHIVE = ".arc/completed/2026-q3/01_review-gate";

interface Change {
  status: string;
  path: string;
}

function meta(cohort = "[none]"): string {
  return [
    "# Metadata: review-gate",
    "",
    "- **State:** `Integrating`",
    `- **Cohort:** ${cohort}`,
    "- **Task List:** `tasks-review-gate.md`",
    "",
  ].join("\n");
}

function resolution(): LifecycleTailProofResolutionInput {
  const scope = {
    baseRef: "main",
    diffBaseSha: DIFF_BASE,
    policyVersion: POLICY,
    rubricVersion: "independent-analysis/v1",
    sourceIdentity: "agent-1",
  };
  return {
    predicateId: "lifecycle-bookkeeping-tail/v1",
    reviewedThroughSha: REVIEWED,
    currentHeadSha: CURRENT,
    reviewed: scope,
    current: { ...scope },
  };
}

function nameStatus(changes: Change[]): string {
  return changes.flatMap((change) => [change.status, change.path]).join("\0") + "\0";
}

function git(input: { changes: Change[]; text?: Record<string, string>; blobs?: Record<string, string> }): GitExec {
  return async (_command, args) => {
    if (args[0] === "diff") return { stdout: nameStatus(input.changes) };
    if (args[0] === "show") {
      const target = args[1];
      if (target !== undefined && input.text?.[target] !== undefined) return { stdout: input.text[target]! };
    }
    if (args[0] === "rev-parse") {
      const target = args.at(-1);
      if (target !== undefined && input.blobs?.[target] !== undefined) return { stdout: `${input.blobs[target]}\n` };
    }
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  };
}

function ordinaryArchive(extra: readonly Change[] = []): Change[] {
  return [
    { status: "D", path: `${ACTIVE}/meta-${SLUG}.md` },
    { status: "A", path: `${ARCHIVE}/meta-${SLUG}.md` },
    { status: "D", path: `${ACTIVE}/tasks-${SLUG}.md` },
    { status: "A", path: `${ARCHIVE}/tasks-${SLUG}.md` },
    ...extra,
  ];
}

function ordinaryAdapter(
  extra: readonly Change[] = [],
  blobs?: Record<string, string>,
): GitLifecycleTailProofAdapter {
  return new GitLifecycleTailProofAdapter({
    exec: git({
      changes: ordinaryArchive(extra),
      text: { [`${REVIEWED}:${ACTIVE}/meta-${SLUG}.md`]: meta() },
      blobs,
    }),
  });
}

describe("Git lifecycle bookkeeping-tail predicate", () => {
  it("accepts one archived artifact group, byte-identical companions, notes cleanup, and ROADMAP", async () => {
    const sourceMeta = `${ACTIVE}/meta-${SLUG}.md`;
    const sourceTasks = `${ACTIVE}/tasks-${SLUG}.md`;
    const sourceNotes = `${ACTIVE}/notes-${SLUG}.md`;
    const sourceSpec = `${ACTIVE}/spec-${SLUG}.md`;
    const destinationMeta = `${ARCHIVE}/meta-${SLUG}.md`;
    const destinationTasks = `${ARCHIVE}/tasks-${SLUG}.md`;
    const destinationSpec = `${ARCHIVE}/spec-${SLUG}.md`;
    const adapter = new GitLifecycleTailProofAdapter({
      exec: git({
        changes: [
          { status: "D", path: sourceMeta },
          { status: "A", path: destinationMeta },
          { status: "D", path: sourceTasks },
          { status: "A", path: destinationTasks },
          { status: "D", path: sourceNotes },
          { status: "D", path: sourceSpec },
          { status: "A", path: destinationSpec },
          { status: "M", path: ".arc/backlog/ROADMAP.md" },
        ],
        text: { [`${REVIEWED}:${sourceMeta}`]: meta() },
        blobs: {
          [`${REVIEWED}:${sourceSpec}`]: "e".repeat(40),
          [`${CURRENT}:${destinationSpec}`]: "e".repeat(40),
        },
      }),
    });

    await expect(adapter.resolveLifecycleTail(resolution())).resolves.toMatchObject({
      diagnostics: [],
      reviewedThroughSha: REVIEWED,
      currentHeadSha: CURRENT,
      artifact: { workUnitId: SLUG, artifactGroupId: `work-unit:${SLUG}`, cohortPath: null },
    });
  });

  it("accepts a nested cohort closeout with relocated notes and mixed allowed operations", async () => {
    const sourceMeta = `${ACTIVE}/meta-${SLUG}.md`;
    const sourceTasks = `${ACTIVE}/tasks-${SLUG}.md`;
    const sourceNotes = `${ACTIVE}/notes-${SLUG}.md`;
    const sourceDraft = `${ACTIVE}/draft-${SLUG}.md`;
    const destinationMeta = `${ARCHIVE}/meta-${SLUG}.md`;
    const destinationTasks = `${ARCHIVE}/tasks-${SLUG}.md`;
    const destinationNotes = `${ARCHIVE}/notes-${SLUG}.md`;
    const destinationDraft = `${ARCHIVE}/draft-${SLUG}.md`;
    const leafSource = ".arc/backlog/planned/delivery/closeout/cohort-closeout.md";
    const leafDestination = ".arc/completed/2026-q3/01a_cohort-closeout/cohort-closeout.md";
    const parentSource = ".arc/backlog/planned/delivery/cohort-delivery.md";
    const parentDestination = ".arc/completed/2026-q3/01b_cohort-delivery/cohort-delivery.md";
    const adapter = new GitLifecycleTailProofAdapter({
      exec: git({
        changes: [
          { status: "D", path: sourceMeta },
          { status: "A", path: destinationMeta },
          { status: "D", path: sourceTasks },
          { status: "A", path: destinationTasks },
          { status: "D", path: sourceNotes },
          { status: "A", path: destinationNotes },
          { status: "D", path: sourceDraft },
          { status: "A", path: destinationDraft },
          { status: "D", path: leafSource },
          { status: "A", path: leafDestination },
          { status: "D", path: parentSource },
          { status: "A", path: parentDestination },
          { status: "M", path: ".arc/backlog/ROADMAP.md" },
        ],
        text: { [`${REVIEWED}:${sourceMeta}`]: meta("`delivery/closeout`") },
        blobs: {
          [`${REVIEWED}:${sourceDraft}`]: "e".repeat(40),
          [`${CURRENT}:${destinationDraft}`]: "e".repeat(40),
        },
      }),
    });

    await expect(adapter.resolveLifecycleTail(resolution())).resolves.toMatchObject({
      diagnostics: [],
      artifact: { workUnitId: SLUG, cohortPath: "delivery/closeout" },
    });
  });

  it.each([
    ["base retarget", (input: LifecycleTailProofResolutionInput) => {
      input.reviewed = { ...input.reviewed, baseRef: "release" };
    }, "base-ref-drift"],
    ["behind-base merge", (input: LifecycleTailProofResolutionInput) => {
      input.reviewed = { ...input.reviewed, diffBaseSha: "e".repeat(40) };
    }, "diff-base-drift"],
    ["policy", (input: LifecycleTailProofResolutionInput) => {
      input.reviewed = { ...input.reviewed, policyVersion: "e".repeat(64) };
    }, "policy-version-drift"],
    ["rubric", (input: LifecycleTailProofResolutionInput) => {
      input.reviewed = { ...input.reviewed, rubricVersion: "other/v1" };
    }, "rubric-version-drift"],
    ["source", (input: LifecycleTailProofResolutionInput) => {
      input.reviewed = { ...input.reviewed, sourceIdentity: "agent-2" };
    }, "source-identity-drift"],
  ] as const)("rejects %s before inspecting the Git tail", async (_name, mutate, diagnostic) => {
    const input = resolution();
    mutate(input);
    const adapter = new GitLifecycleTailProofAdapter({
      exec: async () => { throw new Error("Git must not run for scope drift"); },
    });

    await expect(adapter.resolveLifecycleTail(input)).resolves.toMatchObject({ diagnostics: [diagnostic] });
  });

  it("returns no proof when a storage tier leaves the reviewed code head unchanged", async () => {
    const input = resolution();
    input.currentHeadSha = input.reviewedThroughSha;
    const adapter = new GitLifecycleTailProofAdapter({
      exec: async () => { throw new Error("Git must not run without a tail"); },
    });

    await expect(adapter.resolveLifecycleTail(input)).resolves.toBeNull();
  });

  it.each([
    ["code", [{ status: "M", path: "packages/arc-framework/src/cli.ts" }], "unrecognized-tail-change"],
    ["workflow control", [{ status: "M", path: ".github/workflows/review-gate.yml" }], "unrecognized-tail-change"],
    ["ARC system", [{ status: "M", path: ".arc/system/rules/DEV-RULES.ARC.md" }], "unrecognized-tail-change"],
    ["unrelated work unit", [
      { status: "D", path: ".arc/active/meta-other-work.md" },
      { status: "A", path: ".arc/completed/2026-q3/02_other-work/meta-other-work.md" },
    ], "ambiguous-artifact-group"],
    ["rename ambiguity", [{ status: "R", path: `${ARCHIVE}/notes-${SLUG}.md` }], "unrecognized-tail-change"],
    ["deleted-added notes spoof", [{ status: "A", path: `${ARCHIVE}/notes-${SLUG}.md` }], "unrecognized-tail-change"],
    ["ROADMAP plus code", [
      { status: "M", path: ".arc/backlog/ROADMAP.md" },
      { status: "M", path: "packages/arc-framework/src/cli.ts" },
    ], "unrecognized-tail-change"],
  ] as const)("rejects %s in the tail grammar", async (_name, changes, diagnostic) => {
    await expect(ordinaryAdapter(changes).resolveLifecycleTail(resolution()))
      .resolves.toMatchObject({ diagnostics: [diagnostic] });
  });

  it("rejects authored design content that changes during relocation", async () => {
    const source = `${ACTIVE}/spec-${SLUG}.md`;
    const destination = `${ARCHIVE}/spec-${SLUG}.md`;
    const adapter = ordinaryAdapter([
      { status: "D", path: source },
      { status: "A", path: destination },
    ], {
      [`${REVIEWED}:${source}`]: "e".repeat(40),
      [`${CURRENT}:${destination}`]: "f".repeat(40),
    });

    await expect(adapter.resolveLifecycleTail(resolution()))
      .resolves.toMatchObject({ diagnostics: ["unrecognized-tail-change"] });
  });

  it("reports unavailable Git objects and an unknown predicate without granting a proof", async () => {
    const unavailable = new GitLifecycleTailProofAdapter({
      exec: async () => { throw new Error("objects unavailable"); },
    });
    const unknownPredicate = resolution();
    unknownPredicate.predicateId = "lifecycle-bookkeeping-tail/v2";

    await expect(unavailable.resolveLifecycleTail(resolution()))
      .resolves.toMatchObject({ diagnostics: ["tail-unavailable"] });
    await expect(ordinaryAdapter().resolveLifecycleTail(unknownPredicate))
      .resolves.toMatchObject({ diagnostics: ["invalid-predicate"] });
  });
});
