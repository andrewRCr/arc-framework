import { describe, test, expect, vi } from "vitest";
import {
  plannedWritePaths, findUncommittedPaths, uncommittedChangesError,
} from "../../../src/lib/manifest/uncommitted.js";
import type { FileChangePlan } from "../../../src/lib/manifest/plan.js";
import type { GitExec } from "../../../src/lib/git/index.js";
import { UserFacingError } from "../../../src/lib/errors.js";

const ARC = "/project/.arc";

function planWith(overrides: Partial<FileChangePlan>): FileChangePlan {
  return { additions: [], removals: [], merges: [], skipped: [], reclassified: [], outputToTemplate: {}, ...overrides };
}

describe("plannedWritePaths", () => {
  test("names merges, additions, and Framework removals, but not kept or skipped files", () => {
    const plan = planWith({
      merges: [{ outputPath: "merged.md", templateFile: "merged.md", classification: "Configurable", layer: "core",
        pristineContent: undefined }],
      additions: [{ outputPath: "added.md", templateFile: "added.md", classification: "Framework", layer: "core" }],
      removals: [
        { outputPath: "removed.md", classification: "Framework" },
        { outputPath: "kept.md", classification: "Configurable" },
        { outputPath: "owned.md", classification: "Scaffolded" },
      ],
      skipped: [{ outputPath: "skipped.md", existingEntry: undefined }],
    });

    expect(plannedWritePaths(plan, ARC)).toEqual([`${ARC}/merged.md`, `${ARC}/added.md`, `${ARC}/removed.md`]);
  });
});

describe("findUncommittedPaths", () => {
  test("asks with relative paths and reads every uncommitted entry, skipping a rename's source", async () => {
    const exec = vi.fn<GitExec>(async () => ({
      stdout: "M  .arc/staged.md\0 M .arc/edited.md\0R  .arc/renamed.md\0.arc/old-name.md\0?? .arc/new.md\0",
      stderr: "",
    }));

    const dirty = await findUncommittedPaths(exec, "/project", [`${ARC}/staged.md`]);

    expect(dirty).toEqual([".arc/staged.md", ".arc/edited.md", ".arc/renamed.md", ".arc/new.md"]);
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["--literal-pathspecs", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".arc/staged.md"],
      { cwd: "/project" },
    );
  });

  test("asks nothing of Git when there are no files to check", async () => {
    const exec = vi.fn<GitExec>();

    expect(await findUncommittedPaths(exec, "/project", [])).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("uncommittedChangesError", () => {
  test("names each file and the remedy", () => {
    const err = uncommittedChangesError([".arc/system/arc-config.yml", ".arc/README.md"]);

    expect(err).toBeInstanceOf(UserFacingError);
    expect(err.code).toBe("manifest.uncommitted-changes");
    expect(err.why).toContain(".arc/system/arc-config.yml, .arc/README.md");
    expect(err.whatToDo).toBe("Commit or stash these changes, then retry `arc update`.");
  });
});
