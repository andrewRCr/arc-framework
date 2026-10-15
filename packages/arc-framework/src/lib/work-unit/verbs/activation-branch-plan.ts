/** Read-only work-branch selection, exclusion inventory, and reversible Git steps. */
import { selectWorkBranchLink, workBranchName } from "../../store/lifecycle-branch.js";
import type { GitExec, RawGitExec } from "../../git/exec.js";
import { resolveLifecycleBase } from "../../git/lifecycle-ref-refresh.js";
import { computeDefaultCaptureSet, type DefaultCaptureCommit, type DefaultCaptureSetResult } from "../../git/default-capture-set.js";
import type { BranchLink, CommitCapture } from "../../store/links.js";
import type { StoreRecord } from "../../store/read.js";
import type { LifecycleGitStep } from "../store-transition-types.js";

/** Repository and work-item facts bound before dependency reconciliation can write. */
export interface ActivationBranchPlanInput {
  exec: GitExec;
  execRaw?: RawGitExec;
  cwd: string;
  name: string;
  toBranch: string;
  baseBranch: string;
  repository: string;
  primary: StoreRecord;
  otherPrimaries: readonly StoreRecord[];
}
/** A selected work branch and the user-facing captures excluded on activation. */
export type ActivationBranchPlanResult =
  | { status: "refused"; reason: string }
  | { status: "ready"; link: BranchLink; priorRef: string | null; step: LifecycleGitStep;
      commits: DefaultCaptureCommit[]; report: string[]; remoteDelete?: { text: string; argv?: string[] } };

/** Choose and observe every refusing branch condition before the caller applies reconcile. */
export async function planActivationBranch(input: ActivationBranchPlanInput): Promise<ActivationBranchPlanResult> {
  const branch = await checkoutBranch(input.exec, input.cwd);
  const head = (await input.exec("git", ["rev-parse", "HEAD"], { cwd: input.cwd })).stdout.trim();
  const currentLinked = input.primary.links?.branches?.some((link) =>
    link.repository === input.repository && workBranchName(link.ref) === branch) === true;
  const selected = selectWorkBranchLink(input.primary, { repository: input.repository,
    currentBranch: currentLinked ? branch : undefined });
  if (selected.kind === "ambiguous") return { status: "refused", reason: selected.reason };
  const own = selected.kind === "linked" && workBranchName(selected.link.ref) === branch ? selected.link : undefined;
  const creating = branch === null || branch === input.baseBranch;
  const target = activationTarget(own, input.toBranch);
  if (target !== branch && await branchExists(input.exec, input.cwd, target)) {
    return { status: "refused", reason: `Branch ${target} is already taken; choose another --type or rename that branch.` };
  }
  if (!creating && branchLinkedElsewhere(input, branch)) {
    return { status: "refused", reason: `Another work item already links ${branch}; keep this work on its own branch with git switch -c <name>, then arc activate.` };
  }
  const base = creating ? await resolveLifecycleBase(input.exec, input.cwd, input.baseBranch) : null;
  const inventory = await computeDefaultCaptureSet({ exec: input.exec, execRaw: input.execRaw, cwd: input.cwd,
    baseBranch: input.baseBranch, repository: input.repository, refresh: !creating,
    ...(creating ? {} : { refreshBranch: branch }),
    captures: Object.values(input.primary.links?.taskCaptures ?? {}).flat(), exclusions: own?.excluded ?? [] });
  if (inventory.status === "refused") return { status: "refused", reason: `${inventory.reason} ${inventory.remedy}` };
  const detachedRefusal = await detachedCommitRefusal(input, head, branch);
  if (detachedRefusal !== null) return { status: "refused", reason: detachedRefusal };
  if (creating) return createdBranchPlan(input, branch, head, target, base, inventory.warnings);
  const excluded = mergeExclusions(own?.excluded ?? [], inventory.commits.map((commit) => ({ repository: input.repository, sha: commit.sha,
    ...(commit.copyKey === undefined ? {} : { copyKey: commit.copyKey }) })));
  const link: BranchLink = { repository: input.repository, ref: target, linkedAs: own?.linkedAs ?? "adopted", excluded };
  const report = await activationCaptureReport(input.exec, input.cwd, inventory, branch);
  const remoteDelete = await activationRemoteDeletion(input, own, branch, target);
  return { status: "ready", link, priorRef: own?.ref ?? null, commits: inventory.commits,
    report: [...inventory.warnings, ...report.lines], ...(remoteDelete === undefined ? {} : { remoteDelete }), step: {
      name: target === branch ? "reattach-work-branch" : "rename-work-branch", retryCommand: ["arc", "activate", input.name],
      run: () => target === branch ? Promise.resolve() : input.exec("git", ["branch", "-m", branch, target], { cwd: input.cwd }).then(() => undefined),
      rollback: () => target === branch ? Promise.resolve() : input.exec("git", ["branch", "-m", target, branch], { cwd: input.cwd }).then(() => undefined),
    } };
}

function branchLinkedElsewhere(input: ActivationBranchPlanInput, branch: string): boolean {
  return input.otherPrimaries.some((record) => record.links?.branches?.some((link) =>
    link.repository === input.repository && workBranchName(link.ref) === branch));
}

function createdBranchPlan(input: ActivationBranchPlanInput, branch: string | null, head: string, target: string,
  base: string | null, warnings: string[]): ActivationBranchPlanResult {
  if (base === null) return { status: "refused", reason: `No base ref resolves for ${input.baseBranch}. Fetch origin +refs/heads/${input.baseBranch}:refs/remotes/origin/${input.baseBranch}, or run git branch ${input.baseBranch} <commit>, then retry arc activate ${input.name}.` };
    return { status: "ready", link: { repository: input.repository, ref: target, linkedAs: "created", excluded: [] }, priorRef: null,
      commits: [], report: warnings, step: {
        name: "create-work-branch", retryCommand: ["arc", "activate", input.name],
        run: () => input.exec("git", ["switch", "-c", target, base], { cwd: input.cwd }).then(() => undefined),
        rollback: async () => {
          await input.exec("git", branch === null ? ["switch", "--detach", head] : ["switch", branch], { cwd: input.cwd });
          await input.exec("git", ["update-ref", "-d", `refs/heads/${target}`, base], { cwd: input.cwd });
        },
      } };
}

/** Report task work and the exact merge that makes remote-only commits closable. */
export async function activationCaptureReport(exec: GitExec, cwd: string,
  inventory: Extract<DefaultCaptureSetResult, { status: "available" }>, branch?: string): Promise<{ lines: string[]; mergeRequired: boolean }> {
  const lines: string[] = [];
  let mergeRequired = false;
  let remoteTip: string | null = null;
  if (branch !== undefined) remoteTip = await optionalTip(exec, cwd, `refs/remotes/origin/${branch}`);
  for (const commit of inventory.commits) {
    const held = await exec("git", ["merge-base", "--is-ancestor", commit.sha, "HEAD"], { cwd })
      .then(() => true, (error: unknown) => { if (isMissingExit(error)) return false; throw error; });
    if (!held && remoteTip !== null) { mergeRequired = true; }
    lines.push(`${commit.sha}: ${!held && remoteTip !== null ? `first git merge --ff --no-edit ${remoteTip}; then ` : ""}arc task close <ids> --commit ${commit.sha}`);
  }
  return { lines, mergeRequired };
}
async function oldRemoteDeletion(exec: GitExec, cwd: string, branch: string) {
  const tip = await optionalTip(exec, cwd, `refs/remotes/origin/${branch}`);
  if (tip === null) return undefined;
  const held = await exec("git", ["merge-base", "--is-ancestor", tip, "HEAD"], { cwd })
    .then(() => true, (error: unknown) => { if (isMissingExit(error)) return false; throw error; });
  const argv = ["git", "push", "origin", "--delete", branch];
  return held ? { text: argv.join(" "), argv } : { text: `After git merge --ff --no-edit ${tip}, ${argv.join(" ")}` };
}
async function checkoutBranch(exec: GitExec, cwd: string): Promise<string | null> {
  try { const result = await exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd }); return result.stdout.trim(); }
  catch (error) { if (isMissingExit(error)) return null; throw error; }
}
async function branchExists(exec: GitExec, cwd: string, branch: string): Promise<boolean> {
  return (await optionalTip(exec, cwd, `refs/heads/${branch}`)) !== null;
}
async function optionalTip(exec: GitExec, cwd: string, ref: string): Promise<string | null> {
  try { return (await exec("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd })).stdout.trim() || null; }
  catch (error) { if (isMissingExit(error)) return null; throw error; }
}
function isMissingExit(error: unknown): boolean { return error instanceof Error && "exitCode" in error && error.exitCode === 1; }
function mergeExclusions(prior: CommitCapture[], added: CommitCapture[]): CommitCapture[] {
  const entries = new Map(prior.map((capture) => [JSON.stringify([capture.repository, capture.sha]), capture]));
  for (const capture of added) entries.set(JSON.stringify([capture.repository, capture.sha]), capture);
  return [...entries.values()];
}

async function activationRemoteDeletion(input: ActivationBranchPlanInput, own: BranchLink | undefined, branch: string, target: string) {
  return own?.linkedAs === "created" && target !== branch ? await oldRemoteDeletion(input.exec, input.cwd, branch) : undefined;
}

function activationTarget(own: BranchLink | undefined, requested: string): string {
  return own !== undefined && workBranchName(own.ref).split("/")[0] === requested.split("/")[0] ? workBranchName(own.ref) : requested;
}

async function detachedCommitRefusal(input: ActivationBranchPlanInput, head: string, branch: string | null): Promise<string | null> {
  if (branch !== null) return null;
  const tips = await Promise.all([`refs/heads/${input.baseBranch}`, `refs/remotes/origin/${input.baseBranch}`]
    .map((ref) => optionalTip(input.exec, input.cwd, ref)));
  const bases = tips.filter((tip): tip is string => tip !== null);
  if (bases.length === 0) return `Base ${input.baseBranch} disappeared; preserve detached HEAD with git switch -c <name>, then retry arc activate.`;
  const walk = await input.exec("git", ["--no-replace-objects", "rev-list", head, "--not", ...bases],
    { cwd: input.cwd, objectAccess: "local-only" });
  const commits = walk.stdout.trim().split(/\s+/u).filter(Boolean);
  return commits.length === 0 ? null
    : `Detached HEAD holds commits not on base: ${commits.join(", ")}; preserve them with git switch -c <name>, then arc activate.`;
}
