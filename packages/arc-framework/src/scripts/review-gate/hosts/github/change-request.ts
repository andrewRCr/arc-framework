/** Git and GitHub adapters for exact-head change-request resolution. */

import type { GitExec } from "../../../../lib/git/exec.js";
import {
  ChangeRequestCandidateSchema,
  type ChangeRequestResolutionPort,
} from "../../change-request.js";

function repositoryFromRemote(url: string): string {
  const https = /^(?:https?|ssh):\/\/(?:[^@/]+@)?[^/]+\/([^/]+\/[^/]+?)(?:\.git)?$/u.exec(url);
  const scp = /^(?:[^@]+@)?[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/u.exec(url);
  const repository = https?.[1] ?? scp?.[1];
  if (repository === undefined) throw new Error("Git remote repository coordinates are unsupported.");
  return repository;
}

function parseCandidates(stdout: string) {
  const parsed: unknown = JSON.parse(stdout);
  return ChangeRequestCandidateSchema.array().parse(parsed);
}

/** Build the production GitHub boundary for exact-head change-request resolution. */
export function createGhChangeRequestResolutionPort(
  exec: GitExec,
  cwd: string,
  remote = "origin",
): ChangeRequestResolutionPort {
  return {
    resolveRepository: async () => repositoryFromRemote(
      (await exec("git", ["config", "--get", `remote.${remote}.url`], { cwd })).stdout.trim(),
    ),
    readHeadRef: async (headRef) => {
      await exec("git", ["check-ref-format", "--branch", headRef], { cwd });
      let local: string | null = null;
      try {
        local = (await exec("git", ["rev-parse", "--verify", `refs/heads/${headRef}^{commit}`], { cwd }))
          .stdout.trim();
      } catch {
        // A deleted local branch is expected on a stale invoking checkout.
      }
      const remoteOutput = (await exec("git", ["ls-remote", "--heads", remote, `refs/heads/${headRef}`], { cwd }))
        .stdout.trim();
      const remoteHead = remoteOutput === "" ? null : remoteOutput.split(/\s/u, 1)[0] ?? null;
      return { local, remote: remoteHead };
    },
    listByHead: async (repository, headRef) => parseCandidates((await exec("gh", [
      "pr", "list", "--repo", repository, "--state", "all", "--head", headRef,
      "--limit", "100", "--json", "number,url,state,baseRefName,headRefName,headRefOid",
    ], { cwd })).stdout),
    searchByHeadSha: async (repository, headSha) => parseCandidates((await exec("gh", [
      "pr", "list", "--repo", repository, "--state", "all", "--search", headSha,
      "--limit", "100", "--json", "number,url,state,baseRefName,headRefName,headRefOid",
    ], { cwd })).stdout),
  };
}
