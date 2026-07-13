import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../../../../src/lib/active/meta-reader.js";
import type { GitExec } from "../../../../../../src/lib/git/exec.js";
import {
  resolveAutoLane,
  type AutoLaneInput,
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
  it("accepts existing, new, deleted, and transitioned artifact groups owned by the mapped author", async () => {
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
