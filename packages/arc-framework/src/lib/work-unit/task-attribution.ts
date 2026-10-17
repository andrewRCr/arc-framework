/** Attribute rewritten commits by raw author identity while keeping existing captures additive. */
import type { DefaultCaptureCommit } from "../git/default-capture-set.js";
import type { BranchLink, CommitCapture, Links } from "../store/links.js";

/** One rewrite report identifies the original and the task or exclusions receiving its new copy. */
export interface TaskAttribution { sha: string; matched: string; task?: string; excluded: boolean }
/** Whole-value capture changes prepared before the single task close batch. */
export interface TaskCapturePlan { taskCaptures: NonNullable<Links["taskCaptures"]>; branch: BranchLink; attributions: TaskAttribution[]; uncapturedTasks: string[] }
interface CapturePlanInput { links: Links | undefined; branch: BranchLink; ids: readonly string[]; commits: readonly DefaultCaptureCommit[]; explicit: boolean }
interface CaptureRoute { tasks: { task: string; prior?: CommitCapture }[]; exclusions: CommitCapture[] }

/** Route rewritten default commits to original tasks or exclusions, and explicit/new commits to selected tasks.
 * @param input - Existing links, selected branch/tasks, commit evidence, and explicit-mode choice
 * @returns Additive captures, explicit exclusion removal, and attribution reporting
 */
export function planTaskCaptures(input: CapturePlanInput): TaskCapturePlan {
  const captures = structuredClone(input.links?.taskCaptures ?? {});
  let excluded = [...input.branch.excluded];
  const attributions: TaskAttribution[] = [];
  const delivered = new Set<string>();
  for (const evidence of input.commits) {
    const commit: CommitCapture = { repository: input.branch.repository, sha: evidence.sha,
      ...(evidence.copyKey === undefined ? {} : { copyKey: evidence.copyKey }) };
    const route = captureRoute(input, evidence);
    for (const { task, prior } of route.tasks) {
      captures[task] = appendCapture(captures[task] ?? [], commit); delivered.add(task);
      if (prior !== undefined) attributions.push({ sha: commit.sha, matched: prior.sha, task, excluded: false });
    }
    if (route.exclusions.length > 0) {
      excluded = appendCapture(excluded, commit);
      for (const prior of route.exclusions) attributions.push({ sha: commit.sha, matched: prior.sha, excluded: true });
    }
    if (input.explicit) excluded = excluded.filter((prior) => !sameCapture(prior, commit));
  }
  return { taskCaptures: captures, branch: { ...input.branch, excluded }, attributions,
    uncapturedTasks: input.ids.filter((id) => input.commits.length > 0 && !delivered.has(id)) };
}
function captureRoute(input: CapturePlanInput, evidence: DefaultCaptureCommit): CaptureRoute {
  const author = evidence.copyKey?.split(":")[1];
  const rewrite = !input.explicit && author !== undefined && evidence.authorTime !== null && evidence.committerTime !== null
    && evidence.authorTime !== evidence.committerTime;
  if (!rewrite) return { tasks: input.ids.map((task) => ({ task })), exclusions: [] };
  const matches = (prior: CommitCapture): boolean => prior.repository === input.branch.repository && prior.copyKey?.split(":")[1] === author;
  const tasks = Object.entries(input.links?.taskCaptures ?? {}).flatMap(([task, stored]) => stored.filter(matches).map((prior) => ({ task, prior })));
  if (tasks.length > 0) return { tasks, exclusions: [] };
  const exclusions = input.branch.excluded.filter(matches);
  return { tasks: exclusions.length > 0 ? [] : input.ids.map((task) => ({ task })), exclusions };
}
function sameCapture(left: CommitCapture, right: CommitCapture): boolean {
  return left.repository === right.repository && (left.sha === right.sha
    || (left.copyKey !== undefined && right.copyKey !== undefined && left.copyKey === right.copyKey));
}
function appendCapture(prior: CommitCapture[], next: CommitCapture): CommitCapture[] {
  return prior.some((value) => value.repository === next.repository && value.sha === next.sha) ? prior : [...prior, next];
}
