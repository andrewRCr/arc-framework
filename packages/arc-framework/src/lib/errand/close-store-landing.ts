/** Capture the host's actual landing commit using local copy evidence only. */
import { computeCopyKeys } from "../git/copy-key.js";
import type { GitExec, RawGitExec } from "../git/exec.js";
import { CommitShaSchema, type CommitCapture } from "../store/links.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "../store/project-identity.js";
import type { ErrandRuntimeStorageOptions } from "../store/errand-runtime-transactions.js";
import type { CloseTarget } from "./close-locus.js";
import type { ChangeRequestLifecycleEvidence } from "./change-request-lifecycle.js";
/** Store-specific landing evidence; unchanged-base close has no captured commit. */
export async function readCloseLandingCommit(options: ErrandRuntimeStorageOptions & { exec: GitExec; execRaw?: RawGitExec },
  target: CloseTarget, lifecycle: ChangeRequestLifecycleEvidence | null): Promise<{ kind: "ready"; capture?: CommitCapture } | { kind: "refused"; reason: string }> {
  if (!options.store?.capabilities.stateOffBranch || target.kind === "unchanged-base") return { kind: "ready" };
  if (lifecycle?.mergeCommitSha === undefined) return { kind: "refused", reason: "The host did not report the Errand's landing commit. Refresh its merged change request and retry." };
  const project = await resolveProjectIdentity(options.projectId ?? createProjectIdentityReader(options.store));
  if (project.status !== "ready") return { kind: "refused", reason: `${project.reason} ${project.remedy.text}` };
  const sha = CommitShaSchema.parse(lifecycle.mergeCommitSha);
  const cwd = (await options.exec("git", ["rev-parse", "--show-toplevel"])).stdout.trim();
  const keys = await computeCopyKeys({ cwd, commits: [sha], ...(options.execRaw === undefined ? {} : { execRaw: options.execRaw }) });
  const copyKey = keys.get(sha)?.copyKey;
  return { kind: "ready", capture: { repository: project.id, sha, ...(copyKey === undefined ? {} : { copyKey }) } };
}
