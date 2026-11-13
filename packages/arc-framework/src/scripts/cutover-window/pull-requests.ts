/** Host activity and merge settings that must remain quiescent during the window. */
import type { WindowPullRequests } from "./host.js";
import type { WindowFinding } from "./result.js";

/** Name requests that could advance main or a live branch. */
export function windowPullRequestFindings(requests: WindowPullRequests, liveBranches: readonly string[], flipBranch: string): WindowFinding[] {
  const bases = new Set(["main", flipBranch, ...liveBranches]);
  const findings = requests.open.filter(request => request.number !== requests.flip.number && bases.has(request.baseBranch))
    .map(request => ({ subject: `pull request #${request.number}`,
      condition: `Open request ${request.headBranch} into ${request.baseBranch} could advance a live branch during the window.`,
      remedy: "Merge the request ahead of the window or close it, then retry check." }));
  if (requests.flip.autoMergeArmed) findings.push({ subject: `pull request #${requests.flip.number}`,
    condition: "The flip's auto-merge is armed and could merge before the final head authorization.",
    remedy: `Disarm it with gh pr merge ${requests.flip.number} --disable-auto, then retry check.` });
  return findings;
}

/** Name merge modes incompatible with proving the flip's merge through ancestry. */
export function windowMergeSettingFindings(settings: { allowSquash: boolean; allowRebase: boolean }): WindowFinding[] {
  return ([[settings.allowSquash, "squash"], [settings.allowRebase, "rebase"]] as const)
    .filter(([enabled]) => enabled).map(([, mode]) => ({ subject: `host ${mode} merging`,
      condition: `${mode} merging is enabled, so ancestry cannot prove the flip merged.`,
      remedy: `Disable ${mode} merging for the window, then retry check.` }));
}
