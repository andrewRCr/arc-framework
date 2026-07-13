/** Live least-privilege qualification for one opaque App installation token. */

import { arrayAt, integerAt, objectAt, stringAt } from "../../core/validation.js";
import { verifyInstallationAuthority } from "./receipt-auth.js";
import type { GitHubRestClient, ReadOutcome } from "./api/rest.js";

export interface InstallationTokenQualification {
  appId: string;
  installationId: string;
  repositoryId: string;
  repositoryCount: number;
  permissions: {
    checks: "write";
    metadata: "read";
    pullRequests: "write";
    statuses: "read";
  };
  deniedCapabilities: ["administration:write", "contents:write", "merge"];
  denialProbes: { administrationRead: "denied"; contentsRead: "denied" };
}

function valueOrThrow<T>(outcome: ReadOutcome<T>, locus: string): T {
  if (outcome.kind !== "ok") throw new Error(`token-qualification:${locus}-unavailable:${outcome.kind}`);
  return outcome.value;
}

/** Prove identity, exact selected repository, and exact permission grants without inspecting token bytes. */
export async function qualifyInstallationToken(input: {
  rest: GitHubRestClient;
  expectedAppId: string;
  expectedAppSlug: string;
  expectedBotId: string;
  expectedRepositoryId: string;
  owner: string;
  repo: string;
}): Promise<InstallationTokenQualification> {
  const authority = await verifyInstallationAuthority(input.rest, {
    appSlug: input.expectedAppSlug,
    expectedBotId: input.expectedBotId,
    expectedRepositoryId: input.expectedRepositoryId,
  });
  if (authority.kind !== "verified") throw new Error(`token-qualification:authority:${authority.reason}`);

  const installation = valueOrThrow(await input.rest.get("/installation", {
    parse: (value) => {
      const record = objectAt(value, "installation");
      const permissions = objectAt(record.permissions, "installation.permissions");
      const keys = Object.keys(permissions).sort();
      const expectedKeys = ["checks", "metadata", "pull_requests", "statuses"];
      if (keys.join(",") !== expectedKeys.join(",")
        || permissions.checks !== "write"
        || permissions.metadata !== "read"
        || permissions.pull_requests !== "write"
        || permissions.statuses !== "read") {
        throw new Error("installation permissions are not exact");
      }
      return {
        appId: String(integerAt(record.app_id, "installation.app_id", 1)),
        installationId: String(integerAt(record.id, "installation.id", 1)),
        repositorySelection: stringAt(record.repository_selection, "installation.repository_selection"),
      };
    },
  }), "installation");
  if (installation.appId !== input.expectedAppId || installation.repositorySelection !== "selected") {
    throw new Error("token-qualification:installation-identity-mismatch");
  }

  const repositories = valueOrThrow(await input.rest.getPaginated("/installation/repositories", {
    query: { per_page: 100 },
    parsePage: (value) => {
      const record = objectAt(value, "installationRepositories");
      return arrayAt(record.repositories, "installationRepositories.repositories", (repository, path) => {
        const item = objectAt(repository, path);
        return String(integerAt(item.id, `${path}.id`, 1));
      });
    },
  }), "repositories");
  if (repositories.length !== 1 || repositories[0] !== input.expectedRepositoryId) {
    throw new Error("token-qualification:repository-selection-mismatch");
  }
  const deniedReads = await Promise.all([
    input.rest.get(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/actions/permissions`, {
      parse: () => true,
    }),
    input.rest.get(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents`, {
      parse: () => true,
    }),
  ]);
  if (deniedReads.some((outcome) => outcome.kind !== "http-error" || ![403, 404].includes(outcome.status))) {
    throw new Error("token-qualification:denied-capability-accessible");
  }

  return {
    appId: installation.appId,
    installationId: installation.installationId,
    repositoryId: repositories[0],
    repositoryCount: repositories.length,
    permissions: { checks: "write", metadata: "read", pullRequests: "write", statuses: "read" },
    deniedCapabilities: ["administration:write", "contents:write", "merge"],
    denialProbes: { administrationRead: "denied", contentsRead: "denied" },
  };
}
