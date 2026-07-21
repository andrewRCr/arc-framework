import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../../../../src/lib/active/meta-reader.js";
import type { GitExec } from "../../../../../../src/lib/git/exec.js";
import {
  resolveOwnership,
  type ChangedPath,
  type OwnershipResolutionInput,
} from "../../../../../../src/scripts/review-gate/policy/self-hosting/lane.js";

function meta(owner: string): string {
  return renderMetaFile("sample", { Owner: owner });
}

function execWith(files: Record<string, string>): GitExec {
  return async (_command, args) => {
    const key = args[1]?.replace(/^([^:]+):(.*)$/u, "$1:$2") ?? "";
    const content = files[key];
    if (content === undefined) throw new Error("missing ref path");
    return { stdout: content };
  };
}

const common = {
  diffBaseSha: "base",
  headSha: "head",
  authorLogin: "andrewRCr",
  authorMap: { andrewRCr: "andrew" },
};

describe("self-hosting ownership", () => {
  it("resolves self when every known artifact owner matches the author mapping", async () => {
    await expect(resolveOwnership({
      ...common,
      exec: execWith({
        "base:.arc/active/meta-existing.md": meta("andrew"),
        "head:.arc/active/meta-existing.md": meta("andrew"),
      }),
      changes: [{ status: "modified", path: ".arc/active/tasks-existing.md" }],
    })).resolves.toEqual({ relation: "self" });
  });

  it.each([
    ["foreign", {
      files: {
        "base:.arc/active/meta-existing.md": meta("other"),
        "head:.arc/active/meta-existing.md": meta("other"),
      },
      changes: [{ status: "modified" as const, path: ".arc/active/tasks-existing.md" }],
    }],
    ["mixed", {
      files: {
        "base:.arc/active/meta-one.md": meta("andrew"),
        "head:.arc/active/meta-one.md": meta("andrew"),
        "base:.arc/active/meta-two.md": meta("other"),
        "head:.arc/active/meta-two.md": meta("other"),
      },
      changes: [
        { status: "modified" as const, path: ".arc/active/tasks-one.md" },
        { status: "modified" as const, path: ".arc/active/tasks-two.md" },
      ],
    }],
    ["ownerless", {
      files: {},
      changes: [{ status: "modified" as const, path: ".arc/backlog/planned/cohort-sample.md" }],
    }],
    ["not-applicable", {
      files: {},
      changes: [{ status: "modified" as const, path: "README.md" }],
    }],
  ])("resolves %s distinctly", async (relation, fixture) => {
    await expect(resolveOwnership({
      ...common,
      exec: execWith(fixture.files),
      changes: fixture.changes,
    })).resolves.toEqual({ relation });
  });

  it.each([
    ".arc/backlog/planned/doc-conventions/cohort-doc-conventions.md",
    ".arc/backlog/provisional/some-cohort/cohort-some-cohort.md",
    ".arc/active/cohort-sample.md",
  ])("groups a cohort document beside the work units it coordinates: %s", async (path) => {
    await expect(resolveOwnership({
      ...common,
      exec: execWith({}),
      changes: [{ status: "modified" as const, path }],
    })).resolves.toEqual({ relation: "ownerless" });
  });

  it("rejects a lifecycle-root sibling that only shares the active prefix", async () => {
    await expect(resolveOwnership({
      ...common,
      exec: execWith({}),
      changes: [{ status: "modified", path: ".arc/active-old/cohort-sample.md" }],
    })).resolves.toEqual({ relation: "not-applicable" });
  });

  it("treats non-applicable and ownerless members as neutral beside one known owner", async () => {
    await expect(resolveOwnership({
      ...common,
      exec: execWith({
        "base:.arc/active/meta-existing.md": meta("andrew"),
        "head:.arc/active/meta-existing.md": meta("andrew"),
      }),
      changes: [
        { status: "modified", path: ".arc/active/tasks-existing.md" },
        { status: "modified", path: ".arc/backlog/planned/cohort-sample.md" },
        { status: "modified", path: "README.md" },
      ],
    })).resolves.toEqual({ relation: "self" });
  });

  it("lets unavailable evidence dominate otherwise known ownership", async () => {
    await expect(resolveOwnership({
      ...common,
      exec: execWith({
        "base:.arc/active/meta-existing.md": meta("andrew"),
        "head:.arc/active/meta-existing.md": meta("andrew"),
      }),
      changes: [
        { status: "modified", path: ".arc/active/tasks-existing.md" },
        { status: "modified", path: ".arc/active/tasks-missing.md" },
      ],
    })).resolves.toEqual({ relation: "unknown" });
  });

  it.each<{ label: string; files: Record<string, string>; change: ChangedPath }>([
    {
      label: "addition at head",
      files: { "head:.arc/active/meta-new.md": meta("andrew") },
      change: { status: "added", path: ".arc/active/tasks-new.md" },
    },
    {
      label: "deletion at base",
      files: { "base:.arc/active/meta-old.md": meta("andrew") },
      change: { status: "deleted", path: ".arc/active/tasks-old.md" },
    },
    {
      label: "rename across both refs",
      files: {
        "base:.arc/active/meta-existing.md": meta("andrew"),
        "head:.arc/active/meta-existing.md": meta("andrew"),
      },
      change: {
        status: "renamed",
        previousPath: ".arc/active/draft-existing.md",
        path: ".arc/active/tasks-existing.md",
      },
    },
    {
      label: "copy across both refs",
      files: {
        "base:.arc/active/meta-existing.md": meta("andrew"),
        "head:.arc/active/meta-existing.md": meta("andrew"),
      },
      change: {
        status: "copied",
        previousPath: ".arc/active/draft-existing.md",
        path: ".arc/active/tasks-existing.md",
      },
    },
  ])("reads $label", async ({ files, change }) => {
    await expect(resolveOwnership({
      ...common,
      exec: execWith(files),
      changes: [change],
    })).resolves.toEqual({ relation: "self" });
  });

  it.each<{ label: string; files: Record<string, string>; override: Partial<OwnershipResolutionInput> }>([
    { label: "an unmapped author", files: {}, override: { authorLogin: "unknown" } },
    { label: "an empty change set", files: {}, override: { changes: [] } },
    {
      label: "a malformed meta",
      files: {
        "base:.arc/active/meta-existing.md": "malformed",
        "head:.arc/active/meta-existing.md": "malformed",
      },
      override: {},
    },
    {
      label: "an owner transition",
      files: {
        "base:.arc/active/meta-existing.md": meta("other"),
        "head:.arc/active/meta-existing.md": meta("andrew"),
      },
      override: {},
    },
    {
      label: "a cross-group move",
      files: {},
      override: {
        changes: [{
          status: "renamed",
          previousPath: ".arc/active/tasks-old.md",
          path: ".arc/active/tasks-new.md",
        }],
      },
    },
    {
      label: "an unsafe path",
      files: {},
      override: { changes: [{ status: "modified", path: "../tasks-existing.md" }] },
    },
  ])("fails closed for $label", async ({ files, override }) => {
    await expect(resolveOwnership({
      ...common,
      exec: execWith(files),
      changes: [{ status: "modified", path: ".arc/active/tasks-existing.md" }],
      ...override,
    })).resolves.toEqual({ relation: "unknown" });
  });
});
