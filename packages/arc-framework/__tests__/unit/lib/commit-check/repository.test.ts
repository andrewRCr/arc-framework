/** Unit tests for constructing the default commit-check repository adapter. */

import { describe, expect, it, vi } from "vitest";

import { createDefaultCommitCheckRepository } from "../../../../src/lib/commit-check/repository.js";
import { validateCommitMessage } from "../../../../src/lib/commit-check/validate.js";
import type { GitExec } from "../../../../src/lib/git/index.js";

describe("createDefaultCommitCheckRepository", () => {
  it("resolves config, encoding, merge state, role, and artifact lookup into one context", async () => {
    const exec: GitExec = async (_command, args) => {
      const key = args.join(" ");
      if (key === "config --get --default utf-8 i18n.commitEncoding") {
        return { stdout: "windows-1252\n" };
      }
      if (key === "config --get --default default commit.cleanup") {
        return { stdout: "whitespace\n" };
      }
      if (key === "config --get --default maintainer arc.role") {
        return { stdout: "contributor\n" };
      }
      if (key === "rev-parse --path-format=absolute --git-path MERGE_HEAD") {
        return { stdout: "/repo/.git/MERGE_HEAD\n" };
      }
      throw new Error(`unexpected git invocation: ${key}`);
    };
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
    const exec: GitExec = async (_command, args) => {
      const key = args.join(" ");
      const values: Record<string, string> = {
        "config --get --default utf-8 i18n.commitEncoding": "utf-8\n",
        "config --get --default default commit.cleanup": "default\n",
        "config --get --default maintainer arc.role": "maintainer\n",
        "rev-parse --path-format=absolute --git-path MERGE_HEAD": "/repo/.git/MERGE_HEAD\n",
      };
      const stdout = values[key];
      if (stdout === undefined) throw new Error(`unexpected git invocation: ${key}`);
      return { stdout };
    };
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
