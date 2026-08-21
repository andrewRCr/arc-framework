/** Developer-authenticated GitHub repository merge-policy reads. */

import type { HostedProcessRunner } from "../../hosted/gh-process.js";
import type { MergeMethodPolicyPort } from "../../merge-method.js";

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function parse(text: string, path: string): Record<string, unknown> {
  try {
    return object(JSON.parse(text) as unknown, path);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${path}: malformed JSON`, { cause: error });
    throw error;
  }
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path}: expected a boolean`);
  return value;
}

/** Build the GitHub-backed repository policy port. */
export function createGhMergeMethodPolicyPort(runner: HostedProcessRunner): MergeMethodPolicyPort {
  return {
    resolveRepository: async () => {
      const repository = parse((await runner.run(["repo", "view", "--json", "nameWithOwner"])).stdout, "repository");
      if (typeof repository.nameWithOwner !== "string" || repository.nameWithOwner === "") {
        throw new Error("repository.nameWithOwner: expected a non-empty string");
      }
      return repository.nameWithOwner;
    },
    readPolicy: async (repository) => {
      const policy = parse((await runner.run(["api", `repos/${repository}`])).stdout, "repository-policy");
      return {
        merge: boolean(policy.allow_merge_commit, "repository-policy.allow_merge_commit"),
        rebase: boolean(policy.allow_rebase_merge, "repository-policy.allow_rebase_merge"),
        squash: boolean(policy.allow_squash_merge, "repository-policy.allow_squash_merge"),
      };
    },
  };
}
