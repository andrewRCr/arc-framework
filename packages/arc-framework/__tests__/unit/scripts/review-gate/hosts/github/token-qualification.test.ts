import { describe, expect, it } from "vitest";

import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import { qualifyInstallationToken } from "../../../../../../src/scripts/review-gate/hosts/github/token-qualification.js";
import { fetchFake, response } from "./api/fetch-fake.js";

const repositories = { total_count: 1, repositories: [{ id: 100 }] };

function client(permissionOverrides: Record<string, string> = {}, selected = repositories): GitHubRestClient {
  const fake = fetchFake([
    response(200, JSON.stringify({ id: 302312524, type: "Bot" })),
    response(200, JSON.stringify(repositories)),
    response(200, JSON.stringify({
      id: 145772297,
      app_id: 4268856,
      repository_selection: "selected",
      permissions: {
        checks: "write",
        metadata: "read",
        pull_requests: "write",
        statuses: "read",
        ...permissionOverrides,
      },
    })),
    response(200, JSON.stringify(selected)),
    response(403, JSON.stringify({ message: "Resource not accessible by integration" })),
    response(404, JSON.stringify({ message: "Not Found" })),
  ]);
  return new GitHubRestClient({ fetch: fake.fetch, token: "opaque", sleep: fake.sleep, maxReadAttempts: 1 });
}

describe("installation-token qualification", () => {
  it("proves exact App, repository selection, permissions, and denied capabilities", async () => {
    await expect(qualifyInstallationToken({
      rest: client(),
      expectedAppId: "4268856",
      expectedAppSlug: "arc-review-gate-andrewrcr",
      expectedBotId: "302312524",
      expectedRepositoryId: "100",
      owner: "o",
      repo: "r",
    })).resolves.toEqual({
      appId: "4268856",
      installationId: "145772297",
      repositoryId: "100",
      repositoryCount: 1,
      permissions: { checks: "write", metadata: "read", pullRequests: "write", statuses: "read" },
      deniedCapabilities: ["administration:write", "contents:write", "merge"],
      denialProbes: { administrationRead: "denied", contentsRead: "denied" },
    });
  });

  it("refuses added privileges and more than the selected repository", async () => {
    await expect(qualifyInstallationToken({
      rest: client({ contents: "write" }),
      expectedAppId: "4268856",
      expectedAppSlug: "arc-review-gate-andrewrcr",
      expectedBotId: "302312524",
      expectedRepositoryId: "100",
      owner: "o",
      repo: "r",
    })).rejects.toThrow(/installation-unavailable:schema-error/u);

    await expect(qualifyInstallationToken({
      rest: client({}, { total_count: 2, repositories: [{ id: 100 }, { id: 200 }] }),
      expectedAppId: "4268856",
      expectedAppSlug: "arc-review-gate-andrewrcr",
      expectedBotId: "302312524",
      expectedRepositoryId: "100",
      owner: "o",
      repo: "r",
    })).rejects.toThrow(/repository-selection-mismatch/u);
  });
});
