/** Production integration-merge target refresh coverage. */

import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../../src/lib/git/exec.js";
import type { ChangeRequestResolutionPort } from
  "../../../../src/scripts/review-gate/change-request.js";
import { createIntegrationMergeDependencies } from
  "../../../../src/scripts/integration/merge-composition.js";

const oid = (character: string): string => character.repeat(40);

function port(headSha: string): ChangeRequestResolutionPort {
  return {
    resolveRepository: async () => "owner/repo",
    readHeadRef: async () => ({ local: null, remote: headSha }),
    listByHead: async () => [{
      number: 42,
      url: "https://example.test/owner/repo/pull/42",
      state: "OPEN",
      baseRefName: "main",
      headRefName: "feat/example",
      headRefOid: headSha,
    }],
    searchByHeadSha: async () => [],
  };
}

describe("integration merge composition", () => {
  it("refreshes the checkpointed pull request from host state without consulting local HEAD", async () => {
    const exec = vi.fn(async () => {
      throw new Error("unexpected Git invocation");
    }) as unknown as GitExec;
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec,
      workUnit: "example",
      changeRequestPort: port(oid("f")),
    });

    await expect(dependencies.refreshTarget({
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    })).resolves.toEqual({
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("f"),
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it("refuses a live pull request whose stable identity moved", async () => {
    const moved: ChangeRequestResolutionPort = {
      ...port(oid("f")),
      listByHead: async () => [{
        number: 43,
        url: "https://example.test/owner/repo/pull/43",
        state: "OPEN",
        baseRefName: "main",
        headRefName: "feat/example",
        headRefOid: oid("f"),
      }],
    };
    const dependencies = createIntegrationMergeDependencies({
      cwd: "/candidate",
      exec: vi.fn() as unknown as GitExec,
      workUnit: "example",
      changeRequestPort: moved,
    });

    await expect(dependencies.refreshTarget({
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      headRef: "feat/example",
      headSha: oid("c"),
    })).rejects.toThrow(/no longer open/u);
  });
});
