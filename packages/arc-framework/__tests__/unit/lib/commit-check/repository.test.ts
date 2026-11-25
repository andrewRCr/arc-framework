/** Unit tests for constructing the default commit-check repository adapter. */

import { describe, expect, it, vi } from "vitest";

import { createDefaultCommitCheckRepository } from "../../../../src/lib/commit-check/repository.js";
import { validateCommitMessage } from "../../../../src/lib/commit-check/validate.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";

describe("createDefaultCommitCheckRepository", () => {
  it("resolves config, encoding, merge state, role, and artifact lookup into one context", async () => {
    const { exec } = scriptGitExec([
      { match: ["config", "--get", "--default", "utf-8", "i18n.commitEncoding"],
        responses: [{ stdout: "windows-1252\n" }] },
      { match: ["config", "--get", "--default", "default", "commit.cleanup"],
        responses: [{ stdout: "whitespace\n" }] },
      { match: ["config", "--get", "--default", "maintainer", "arc.role"],
        responses: [{ stdout: "contributor\n" }] },
      { match: ["rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD"],
        responses: [{ stdout: "/repo/.git/MERGE_HEAD\n" }] },
    ]);
    const resolveArtifact = vi.fn().mockReturnValue("found");

    const repository = await createDefaultCommitCheckRepository("/repo", {
      exec,
      readFile: async (path) => {
        if (path !== "/repo/.arc/system/arc-config.yml") throw new Error(`unexpected path: ${path}`);
        return "hooks.commit_msg: disabled\n";
      },
      pathExists: async (path) => path === "/repo/.git/MERGE_HEAD",
      createArtifactResolver: () => resolveArtifact,
    });

    expect(repository.encoding).toBe("windows-1252");
    expect(repository.cleanup).toBe("whitespace");
    expect(repository.context.repository).toMatchObject({
      mergeInProgress: true,
      role: "contributor",
    });
    expect(await validateCommitMessage("ignored", repository.context)).toEqual({
      kind: "skipped",
      reason: "merge-in-progress",
    });
  });

  it("routes footer artifact validation through the injected resolver", async () => {
    const { exec } = scriptGitExec([
      { match: ["config", "--get", "--default", "utf-8", "i18n.commitEncoding"],
        responses: [{ stdout: "utf-8\n" }] },
      { match: ["config", "--get", "--default", "default", "commit.cleanup"],
        responses: [{ stdout: "default\n" }] },
      { match: ["config", "--get", "--default", "maintainer", "arc.role"],
        responses: [{ stdout: "maintainer\n" }] },
      { match: ["rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD"],
        responses: [{ stdout: "/repo/.git/MERGE_HEAD\n" }] },
    ]);
    const repository = await createDefaultCommitCheckRepository("/repo", {
      exec,
      readFile: async () => "hooks.commit_msg: enabled\n",
      pathExists: async () => false,
      createArtifactResolver: () => async () => "not-found" as const,
    });

    const outcome = await validateCommitMessage([
      "feat(test): route artifact lookup through the repository adapter",
      "",
      "Context: spec-missing.md (planning)",
    ].join("\n"), repository.context);

    expect(outcome).toMatchObject({
      kind: "validated",
      verdict: "pass-with-warnings",
      findings: expect.arrayContaining([
        expect.objectContaining({ code: "footer.artifact-not-found" }),
      ]),
    });
  });
});
