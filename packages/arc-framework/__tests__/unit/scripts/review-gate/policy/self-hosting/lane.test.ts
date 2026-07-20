import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../../../../src/lib/active/meta-reader.js";
import type { GitExec } from "../../../../../../src/lib/git/exec.js";
import {
  resolveAutoLane,
  resolveOwnership,
  type AutoLaneInput,
  type ChangedPath,
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

describe("self-hosting auto lane", () => {
  it("accepts all six canonical statuses for artifact groups owned by the mapped author", async () => {
    const exec = execWith({
      "base:.arc/active/meta-existing.md": meta("andrew"),
      "head:.arc/active/meta-existing.md": meta("andrew"),
      "head:.arc/backlog/planned/new/meta-new.md": meta("andrew"),
      "base:.arc/backlog/planned/old/meta-old.md": meta("andrew"),
    });
    await expect(resolveAutoLane({
      ...common,
      exec,
      changes: [
        { status: "modified", path: ".arc/active/tasks-existing.md" },
        { status: "added", path: ".arc/backlog/planned/new/draft-new.md" },
        { status: "deleted", path: ".arc/backlog/planned/old/notes-old.md" },
        {
          status: "renamed",
          previousPath: ".arc/active/draft-existing.md",
          path: ".arc/active/notes-existing.md",
        },
        {
          status: "copied",
          previousPath: ".arc/active/tasks-existing.md",
          path: ".arc/active/draft-existing.md",
        },
        { status: "type-changed", path: ".arc/active/meta-existing.md" },
      ],
    })).resolves.toEqual({ lane: "auto", reasons: ["author-owned-artifacts"] });
  });

  it("accepts mapped cohort changes as ownerless", async () => {
    await expect(resolveAutoLane({
      ...common,
      exec: execWith({}),
      changes: [{ status: "modified", path: ".arc/backlog/planned/cohort-sample.md" }],
    })).resolves.toEqual({ lane: "auto", reasons: ["ownerless-cohort"] });
  });

  const reviewedCases: Array<[string, Partial<AutoLaneInput>]> = [
    ["unmapped author", { authorLogin: "someone" }],
    ["empty diff", { changes: [] }],
    ["non-lane path", { changes: [{ status: "modified", path: "README.md" }] }],
    ["design authority", { changes: [{ status: "modified", path: ".arc/active/spec-existing.md" }] }],
    ["non-nested backlog artifact", { changes: [{ status: "modified", path: ".arc/backlog/planned/tasks-existing.md" }] }],
    ["rename across groups", {
      changes: [{ status: "renamed", previousPath: ".arc/active/tasks-old.md", path: ".arc/active/tasks-new.md" }],
    }],
    ["copy across groups", {
      changes: [{ status: "copied", previousPath: ".arc/active/tasks-old.md", path: ".arc/active/tasks-new.md" }],
    }],
  ];

  it.each(reviewedCases)("fails reviewed for %s", async (_name, override) => {
    await expect(resolveAutoLane({
      ...common,
      exec: execWith({ "base:.arc/active/meta-existing.md": meta("andrew") }),
      changes: [{ status: "modified", path: ".arc/active/tasks-existing.md" }],
      ...override,
    })).resolves.toMatchObject({ lane: "reviewed" });
  });

  it("uses base ownership so an owner edit cannot self-authorize existing artifacts", async () => {
    await expect(resolveAutoLane({
      ...common,
      exec: execWith({
        "base:.arc/active/meta-existing.md": meta("different-owner"),
        "head:.arc/active/meta-existing.md": meta("andrew"),
      }),
      changes: [
        { status: "modified", path: ".arc/active/meta-existing.md" },
        { status: "modified", path: ".arc/active/tasks-existing.md" },
      ],
    })).resolves.toEqual({ lane: "reviewed", reasons: ["owner-transition"] });
  });

  it("fails reviewed for mixed owners and missing or malformed companions", async () => {
    const mixed = await resolveAutoLane({
      ...common,
      exec: execWith({
        "base:.arc/active/meta-one.md": meta("andrew"),
        "head:.arc/active/meta-one.md": meta("andrew"),
        "base:.arc/active/meta-two.md": meta("other"),
        "head:.arc/active/meta-two.md": meta("other"),
      }),
      changes: [
        { status: "modified", path: ".arc/active/tasks-one.md" },
        { status: "modified", path: ".arc/active/tasks-two.md" },
      ],
    });
    expect(mixed).toMatchObject({ lane: "reviewed" });

    await expect(resolveAutoLane({
      ...common,
      exec: execWith({ "base:.arc/active/meta-existing.md": "malformed" }),
      changes: [{ status: "modified", path: ".arc/active/tasks-existing.md" }],
    })).resolves.toMatchObject({ lane: "reviewed" });
  });
});

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

  it.each<{ label: string; files: Record<string, string>; override: Partial<AutoLaneInput> }>([
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
