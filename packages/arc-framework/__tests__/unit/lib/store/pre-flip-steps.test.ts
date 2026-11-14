/** Each in-repo refusal names the concrete step that does its verb's job while state stays in the checkout. */
import { describe, expect, it } from "vitest";
import {
  adversarialRecordStep, cohortCloseStep, cohortRemoveStep, decomposeDiscardStep, decomposeRevisionStep, errandQueueStep,
  handoffWriteStep, handoverStep, inboxListStep, inboxRemoveByIdStep, projectionSaveStep, releaseCloseStep,
  resumeParkedStep, routeStep, taskMarkStep,
} from "../../../../src/lib/store/pre-flip-steps.js";

describe("pre-flip steps", () => {
  it.each([["close", "[x]"], ["defer", "[~]"]] as const)("task %s names the hand mark and its commit", (operation, mark) => {
    expect(taskMarkStep(operation)).toBe(`Mark the task ${mark} by hand in the task list and commit the mark, staged with`
      + " the task's own commit when that commit is still to come.");
  });

  it("release commit --close names the staged hand mark, then the commit without --close", () => {
    expect(releaseCloseStep()).toBe("Mark the task [x] by hand in the task list, stage the mark with this commit, and run"
      + " arc release commit again without --close.");
  });

  it("save names the commit for tracked files beside the personal save", () => {
    expect(projectionSaveStep()).toMatch(/commit edited tracked ARC files with git commit.*save personal files with arc user save/u);
  });

  it("handoff write names the meta commit and the session notes it writes", () => {
    const step = handoffWriteStep();
    expect(step).toContain("Last Completed, Next Task, and Next Action and commit it");
    expect(step).toContain("SESSION-NOTES.md in the work unit's personal workspace");
    expect(step).toContain("Commit at Handoff");
    expect(step).toContain("arc user save");
    expect(step).not.toMatch(/existing|workflow/u);
  });

  it.each([
    { list: "personal", target: undefined, step: /^Read the personal inbox, USER-INBOX\.md in your personal workspace\.$/u },
    { list: "personal", target: "example", step: /^Run arc user inbox-list --target example, which lists the personal captures/u },
    { list: "project", target: undefined, step: /^Read the project inbox, \.arc\/backlog\/ATOMIC-INBOX\.md\.$/u },
    { list: "example", target: undefined, step: /^Run arc user inbox-list --target example .*Inbound Buffer — Pending Integration/u },
  ])("inbox $list (target $target) names the file or command that lists it", ({ list, target, step }) => {
    expect(inboxListStep(list, target)).toMatch(step);
  });

  it("route names each hand-written destination", () => {
    const step = routeStep();
    expect(step).toContain("USER-INBOX.md in your personal workspace with a WU_Target line");
    expect(step).toContain("_Shapes:_");
    expect(step).toContain("Inbound Buffer — Pending Integration");
    expect(step).toContain(".arc/backlog/ATOMIC-INBOX.md");
    expect(step).not.toMatch(/route-discovered-work|Binding/u);
  });

  it("errand queue names its read separately from its write", () => {
    expect(errandQueueStep("read")).toMatch(/execute-bound entries in the Errand section of USER-INBOX\.md.*arc errand next/u);
    expect(errandQueueStep("set")).toBe("Mark and order the queue with arc user inbox-mark-execute-bound.");
  });

  it("cohort close and remove name the tracked file's archive sweep and deletion", () => {
    expect(cohortCloseStep()).toMatch(/arc archive archives its final member.*tracked cohort-<name>\.md.*closeout sidecar.*commit/u);
    expect(cohortRemoveStep()).toBe("Delete the empty cohort's tracked cohort-<name>.md and commit the deletion.");
  });

  it("decompose revision names the cleanup direction and the revised preflight", () => {
    expect(decomposeRevisionStep("origin")).toMatch(/ask the Owner how to clean it up.*arc decompose origin --preflight/u);
  });

  it("decompose discard names the cleanup direction alone", () => {
    expect(decomposeDiscardStep()).toMatch(/ask the Owner how to clean it up\.$/u);
    expect(decomposeDiscardStep()).not.toContain("--preflight");
  });

  it.each([
    { activity: "draft-readiness", place: "Append this approved pass by hand to ADVERSARIAL-PASSES.md in work unit `example`'s personal workspace" },
    { activity: "task-generation", place: "Append this approved pass by hand to ADVERSARIAL-PASSES.md in work unit `example`'s personal workspace" },
    { activity: "verification", place: "Keep this approved pass by hand with work unit `example`'s criteria report" },
    { activity: "criteria", place: "Keep this approved pass by hand with work unit `example`'s criteria report" },
  ] as const)("adversarial record names the $activity record's place and the entry it holds", ({ activity, place }) => {
    const step = adversarialRecordStep(activity, "example");
    expect(step.startsWith(place)).toBe(true);
    expect(step).toContain("each finding with its account and action, the conditional decision, the response-performance"
      + " check, and the consumption fact");
  });

  it("resume, handover, and ID removal name their pre-flip commands", () => {
    expect(resumeParkedStep("example")).toBe("Resume the parked work unit with arc resume example, which restores its"
      + " preserved branch.");
    expect(handoverStep()).toBe("Edit Owner in the work unit's meta and commit the edit.");
    expect(inboxRemoveByIdStep()).toBe("Remove the entry by its title with arc user inbox-remove --inbox-title-file <file>.");
  });
});
