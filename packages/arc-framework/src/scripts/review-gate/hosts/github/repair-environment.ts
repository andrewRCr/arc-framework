/** Compare-and-stop provisioning contract for the secretless repair environment. */

import { arrayAt, integerAt, objectAt, stringAt } from "../../core/validation.js";
import type { GitHubRestClient, ReadOutcome, WriteOutcome } from "./api/rest.js";

export interface RepairEnvironmentState {
  exists: boolean;
  name: string;
  protectedBranches: boolean;
  customBranchPolicies: boolean;
  branchPolicies: Array<{ name: string; type: "branch" | "tag" }>;
  secretNames: string[];
}

export interface RepairEnvironmentProvisionApi {
  read(): Promise<RepairEnvironmentState>;
  upsert(): Promise<void>;
  replaceBranchPolicies(names: string[]): Promise<void>;
}

function valueOrThrow<T>(outcome: ReadOutcome<T> | WriteOutcome<T>, locus: string): T {
  if (outcome.kind !== "ok") throw new Error(`repair-environment:${locus}-unavailable:${outcome.kind}`);
  return outcome.value;
}

/** GitHub environment reader/provisioner; writes are used only by the operator setup path. */
export class GitHubRestRepairEnvironmentApi implements RepairEnvironmentProvisionApi {
  private readonly root: string;

  constructor(
    private readonly rest: GitHubRestClient,
    owner: string,
    repo: string,
  ) {
    this.root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/review-gate-repair`;
  }

  async read(): Promise<RepairEnvironmentState> {
    const environment = await this.rest.get(this.root, {
      parse: (input) => {
        const value = objectAt(input, "environment");
        const policy = objectAt(value.deployment_branch_policy, "environment.deployment_branch_policy");
        return {
          name: stringAt(value.name, "environment.name"),
          protectedBranches: policy.protected_branches === true,
          customBranchPolicies: policy.custom_branch_policies === true,
        };
      },
    });
    if (environment.kind === "http-error" && environment.status === 404) {
      return {
        exists: false,
        name: "review-gate-repair",
        protectedBranches: false,
        customBranchPolicies: false,
        branchPolicies: [],
        secretNames: [],
      };
    }
    const [branchPolicies, secretNames] = await Promise.all([
      this.readBranchPolicies(),
      this.rest.getPaginated(`${this.root}/secrets`, {
        query: { per_page: 100 },
        parsePage: (input) => {
          const value = objectAt(input, "environmentSecrets");
          return arrayAt(value.secrets, "environmentSecrets.secrets", (item, path) => {
            const secret = objectAt(item, path);
            return stringAt(secret.name, `${path}.name`);
          });
        },
      }),
    ]);
    return {
      exists: true,
      ...valueOrThrow(environment, "read"),
      branchPolicies: valueOrThrow(branchPolicies, "branch-policies"),
      secretNames: valueOrThrow(secretNames, "secrets"),
    };
  }

  async upsert(): Promise<void> {
    valueOrThrow(await this.rest.write("PUT", this.root, {
      body: { deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } },
      parse: (input) => objectAt(input, "environment"),
    }), "upsert");
  }

  async replaceBranchPolicies(names: string[]): Promise<void> {
    const existing = valueOrThrow(await this.readBranchPolicies(true), "branch-policies");
    for (const policy of existing) {
      valueOrThrow(await this.rest.write("DELETE", `${this.root}/deployment-branch-policies/${policy.id}`, {
        emptyValue: null,
        parse: () => null,
      }), "delete-branch-policy");
    }
    for (const name of names) {
      valueOrThrow(await this.rest.write("POST", `${this.root}/deployment-branch-policies`, {
        body: { name, type: "branch" },
        parse: (input) => objectAt(input, "branchPolicy"),
      }), "create-branch-policy");
    }
  }

  private async readBranchPolicies(withIds = false): Promise<ReadOutcome<Array<{
    name: string;
    type: "branch" | "tag";
    id?: number;
  }>>> {
    return this.rest.getPaginated(`${this.root}/deployment-branch-policies`, {
      query: { per_page: 100 },
      parsePage: (input) => {
        const value = objectAt(input, "branchPolicies");
        return arrayAt(value.branch_policies, "branchPolicies.branch_policies", (item, path) => {
          const policy = objectAt(item, path);
          const type = policy.type === undefined ? "branch" : stringAt(policy.type, `${path}.type`);
          if (type !== "branch" && type !== "tag") throw new Error(`${path}.type: invalid policy type`);
          return {
            name: stringAt(policy.name, `${path}.name`),
            type,
            ...(withIds ? { id: integerAt(policy.id, `${path}.id`, 1) } : {}),
          };
        });
      },
    });
  }
}

/** Return every live contract mismatch without mutating repository state. */
export function verifyRepairEnvironment(state: RepairEnvironmentState, defaultBranch: string): string[] {
  const errors: string[] = [];
  const policy = state.branchPolicies[0];
  if (!state.exists || state.name !== "review-gate-repair") errors.push("repair-environment-missing");
  if (state.secretNames.length > 0) errors.push("repair-environment-not-secretless");
  if (state.protectedBranches || !state.customBranchPolicies) {
    errors.push("repair-environment-policy-mode-mismatch");
  }
  if (state.branchPolicies.length !== 1
    || policy === undefined
    || policy.type !== "branch"
    || policy.name !== defaultBranch) {
    errors.push("repair-environment-default-branch-policy-mismatch");
  }
  return errors;
}

/** Compare live state, then create/repair only after an explicit apply mode. */
export async function provisionRepairEnvironment(
  mode: "compare" | "apply",
  defaultBranch: string,
  api: RepairEnvironmentProvisionApi,
): Promise<{ status: "ready" | "stop"; errors: string[] }> {
  const before = await api.read();
  const errors = verifyRepairEnvironment(before, defaultBranch);
  if (errors.length === 0) return { status: "ready", errors: [] };
  if (mode === "compare" || errors.includes("repair-environment-not-secretless")) {
    return { status: "stop", errors };
  }
  await api.upsert();
  await api.replaceBranchPolicies([defaultBranch]);
  const afterErrors = verifyRepairEnvironment(await api.read(), defaultBranch);
  return afterErrors.length === 0 ? { status: "ready", errors: [] } : { status: "stop", errors: afterErrors };
}
