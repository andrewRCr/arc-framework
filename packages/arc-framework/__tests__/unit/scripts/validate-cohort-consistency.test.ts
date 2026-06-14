/**
 * Unit tests for the cohort-consistency validator.
 *
 * Covers the three-condition invariant over backlog-scoped artifacts: (a) the
 * `**Cohort:**` field ↔ filed-dir path-match (single + nested + drift +
 * standalone), and (b) the cohort-doc schema checks — constitutive-doc presence
 * per grouping dir, the `Purpose` floor, and orphan member sections (slug ∉
 * derived members). Uses an in-memory file reader — no filesystem dependency.
 *
 * Also covers the lifecycle-complete augmentation: a {@link LiveCohortContext}
 * lets conditions (b)/(c) recognize an unstaged ancestor doc and a graduated
 * member (one that relocated to `active/` or `completed/`) instead of flagging
 * either as an orphan.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  classifyPath,
  validateFiles,
  buildLiveCohortContext,
  buildLiveCohortContextFromDisk,
  deriveScanRoot,
  type LiveCohortContext,
} from "../../../src/scripts/validate-cohort-consistency.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";

function fakeReader(files: Record<string, string>) {
  return (path: string) => {
    const content = files[path];
    if (content === undefined) throw new Error(`no content for ${path}`);
    return content;
  };
}

/** A backlog meta filed at `path`, carrying the given `Cohort` field value. */
function metaFor(wuName: string, cohort: string): string {
  return renderMetaFile(wuName, { State: "Planning", Owner: "andrew", Cohort: cohort });
}

/** A cohort doc with an optional Purpose floor and per-member sections. */
function cohortDoc(
  leaf: string,
  opts: { purpose?: string | null; members?: string[] } = {},
): string {
  const { purpose = "Why this grouping of work units exists.", members = [] } = opts;
  const lines = [`# Cohort: \`${leaf}\``, ""];
  if (purpose !== null) lines.push(`**Purpose:** ${purpose}`, "");
  if (members.length > 0) {
    lines.push("## Members", "");
    for (const member of members) {
      lines.push(`### \`${member}\``, "", "_Exposes:_ a surface.", "");
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function run(files: Record<string, string>): ReturnType<typeof validateFiles> {
  return validateFiles(Object.keys(files), fakeReader(files));
}

describe("classifyPath", () => {
  it("classifies backlog metas and cohort docs, ignoring everything else", () => {
    expect(classifyPath(".arc/backlog/planned/core/widget/meta-widget.md")).toBe("meta");
    expect(classifyPath(".arc/backlog/planned/core/cohort-core.md")).toBe("cohort-doc");
    expect(classifyPath(".arc/backlog/planned/core/widget/draft-widget.md")).toBe("other");
    expect(classifyPath(".arc/active/meta-foo.md")).toBe("other");
  });
});

describe("validateFiles — Cohort field↔dir path-match", () => {
  it("passes when a WU's Cohort equals its single-segment parent dir-path", () => {
    const files = {
      ".arc/backlog/planned/core/widget/meta-widget.md": metaFor("widget", "core"),
      ".arc/backlog/planned/core/cohort-core.md": cohortDoc("core"),
    };
    const result = run(files);
    expect(result.pass).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("path-matches a nested <cohort>/<subcohort> dir", () => {
    const files = {
      ".arc/backlog/planned/core/sub/widget/meta-widget.md": metaFor("widget", "core/sub"),
      ".arc/backlog/planned/core/cohort-core.md": cohortDoc("core"),
      ".arc/backlog/planned/core/sub/cohort-sub.md": cohortDoc("sub"),
    };
    expect(run(files).pass).toBe(true);
  });

  it("fails on drift — a WU assigned to one cohort but filed under another", () => {
    const files = {
      ".arc/backlog/planned/core/widget/meta-widget.md": metaFor("widget", "other"),
      ".arc/backlog/planned/core/cohort-core.md": cohortDoc("core"),
    };
    const result = run(files);
    expect(result.pass).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toContain("meta-widget.md");
    expect(result.diagnostics[0]).toMatch(/does not match/i);
  });

  it("passes a standalone WU with no cohort dir", () => {
    const files = {
      ".arc/backlog/planned/solo/meta-solo.md": metaFor("solo", "[none]"),
    };
    expect(run(files).pass).toBe(true);
  });
});

describe("validateFiles — cohort-doc schema checks", () => {
  it("fails when a grouping dir carries no cohort doc", () => {
    const files = {
      ".arc/backlog/planned/core/widget/meta-widget.md": metaFor("widget", "core"),
    };
    const result = run(files);
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => /cohort-core\.md/.test(d))).toBe(true);
  });

  it("requires a cohort doc for every prefix of a nested grouping dir", () => {
    const files = {
      ".arc/backlog/planned/core/sub/widget/meta-widget.md": metaFor("widget", "core/sub"),
      ".arc/backlog/planned/core/sub/cohort-sub.md": cohortDoc("sub"),
      // Missing the intermediate `core` cohort doc.
    };
    const result = run(files);
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => /cohort-core\.md/.test(d))).toBe(true);
  });

  it("fails a cohort doc with no Purpose floor", () => {
    const files = {
      ".arc/backlog/planned/core/widget/meta-widget.md": metaFor("widget", "core"),
      ".arc/backlog/planned/core/cohort-core.md": cohortDoc("core", { purpose: null }),
    };
    const result = run(files);
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => /purpose/i.test(d))).toBe(true);
  });

  it("fails an orphan member section (slug ∉ derived members)", () => {
    const files = {
      ".arc/backlog/planned/core/widget/meta-widget.md": metaFor("widget", "core"),
      ".arc/backlog/planned/core/cohort-core.md": cohortDoc("core", {
        members: ["widget", "ghost"],
      }),
    };
    const result = run(files);
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => /orphan.*ghost/i.test(d))).toBe(true);
    // The real member must not be flagged.
    expect(result.diagnostics.some((d) => /widget/.test(d) && /orphan/i.test(d))).toBe(false);
  });

  it("passes a derived member that has no section (sections are a subset, not a roster)", () => {
    const files = {
      ".arc/backlog/planned/core/widget/meta-widget.md": metaFor("widget", "core"),
      ".arc/backlog/planned/core/gadget/meta-gadget.md": metaFor("gadget", "core"),
      ".arc/backlog/planned/core/cohort-core.md": cohortDoc("core", { members: ["widget"] }),
    };
    expect(run(files).pass).toBe(true);
  });

  it("flags a cohort doc whose filename does not match its grouping dir", () => {
    const files = {
      ".arc/backlog/planned/core/widget/meta-widget.md": metaFor("widget", "core"),
      ".arc/backlog/planned/core/cohort-wrong.md": cohortDoc("core"),
    };
    const result = run(files);
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => /filename/i.test(d))).toBe(true);
  });
});

describe("deriveScanRoot", () => {
  it("returns process.cwd() for a relative staged path (the hook's normal form)", () => {
    expect(deriveScanRoot([".arc/backlog/planned/core/cohort-core.md"])).toBe(process.cwd());
  });

  it("returns the prefix before `.arc/` for an absolute staged path", () => {
    expect(deriveScanRoot(["/tmp/case-x/.arc/backlog/planned/core/widget/meta-widget.md"])).toBe(
      "/tmp/case-x",
    );
  });

  it("falls back to process.cwd() when no path carries an `.arc/` segment", () => {
    expect(deriveScanRoot(["README.md", "src/index.ts"])).toBe(process.cwd());
  });
});

describe("buildLiveCohortContext", () => {
  it("maps members to their Cohort-field value across lifecycle roots", () => {
    const metas = [
      { path: ".arc/active/meta-active-one.md", content: metaFor("active-one", "core") },
      {
        path: ".arc/backlog/provisional/core/provisional-one/meta-provisional-one.md",
        content: metaFor("provisional-one", "core"),
      },
      {
        path: ".arc/completed/2026-q2/01_shipped/meta-shipped-one.md",
        content: metaFor("shipped-one", "core"),
      },
      {
        path: ".arc/backlog/planned/core/planned-one/meta-planned-one.md",
        content: metaFor("planned-one", "core"),
      },
      { path: ".arc/active/meta-standalone.md", content: metaFor("standalone", "[none]") },
    ];
    const ctx = buildLiveCohortContext(metas, [
      ".arc/backlog/planned/core/cohort-core.md",
      ".arc/backlog/planned/core/sub/cohort-sub.md",
    ]);
    expect(ctx.liveMembersByDir.get("core")).toEqual(
      new Set(["active-one", "provisional-one", "shipped-one", "planned-one"]),
    );
    // A standalone WU ([none]) contributes no membership.
    expect(ctx.liveMembersByDir.has("")).toBe(false);
    expect([...ctx.existingCohortDocDirs].sort()).toEqual(["core", "core/sub"]);
  });

  it("excludes a malformed (unparseable) meta from membership without throwing — best-effort", () => {
    const metas = [
      { path: ".arc/active/meta-good.md", content: metaFor("good", "core") },
      { path: ".arc/active/meta-bad.md", content: "# Metadata: bad\n\n| **State** |\n|---|\n" },
    ];

    let ctx!: LiveCohortContext;
    expect(() => {
      ctx = buildLiveCohortContext(metas, []);
    }).not.toThrow();
    expect(ctx.liveMembersByDir.get("core")).toEqual(new Set(["good"]));
  });
});

describe("buildLiveCohortContextFromDisk", () => {
  it("walks backlog/provisional as part of lifecycle-complete membership", () => {
    const root = mkdtempSync(join(tmpdir(), "arc-cohort-live-"));
    try {
      const planned = join(root, ".arc", "backlog", "planned", "core");
      const provisional = join(root, ".arc", "backlog", "provisional", "core", "drafty");
      mkdirSync(planned, { recursive: true });
      mkdirSync(provisional, { recursive: true });
      writeFileSync(join(planned, "cohort-core.md"), cohortDoc("core"));
      writeFileSync(join(provisional, "meta-drafty.md"), metaFor("drafty", "core"));

      const ctx = buildLiveCohortContextFromDisk(root);

      expect(ctx.liveMembersByDir.get("core")).toEqual(new Set(["drafty"]));
      expect(ctx.existingCohortDocDirs).toEqual(new Set(["core"]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("validateFiles — lifecycle-complete context", () => {
  it("does not flag a graduated member (active/completed) as an orphan section", () => {
    const files = {
      ".arc/backlog/planned/core/widget/meta-widget.md": metaFor("widget", "core"),
      ".arc/backlog/planned/core/cohort-core.md": cohortDoc("core", {
        members: ["widget", "shipped"],
      }),
    };
    const live: LiveCohortContext = {
      liveMembersByDir: new Map([["core", new Set(["widget", "shipped"])]]),
      existingCohortDocDirs: new Set(["core"]),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files), live);
    expect(result.pass).toBe(true);
  });

  it("still flags a slug that resolves to no member anywhere", () => {
    const files = {
      ".arc/backlog/planned/core/widget/meta-widget.md": metaFor("widget", "core"),
      ".arc/backlog/planned/core/cohort-core.md": cohortDoc("core", {
        members: ["widget", "ghost"],
      }),
    };
    const live: LiveCohortContext = {
      liveMembersByDir: new Map([["core", new Set(["widget"])]]),
      existingCohortDocDirs: new Set(["core"]),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files), live);
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => /orphan.*ghost/i.test(d))).toBe(true);
  });

  it("accepts an unstaged ancestor cohort doc present on disk (condition b)", () => {
    // Adding a member under core/sub; only the sub cohort doc is staged — the
    // ancestor `core` doc lives on disk (unstaged), recorded in the live context.
    const files = {
      ".arc/backlog/planned/core/sub/widget/meta-widget.md": metaFor("widget", "core/sub"),
      ".arc/backlog/planned/core/sub/cohort-sub.md": cohortDoc("sub"),
    };
    const live: LiveCohortContext = {
      liveMembersByDir: new Map([["core/sub", new Set(["widget"])]]),
      existingCohortDocDirs: new Set(["core", "core/sub"]),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files), live);
    expect(result.pass).toBe(true);
  });

  it("still flags a grouping dir whose doc is absent from both staged set and disk", () => {
    const files = {
      ".arc/backlog/planned/core/widget/meta-widget.md": metaFor("widget", "core"),
    };
    const live: LiveCohortContext = {
      liveMembersByDir: new Map([["core", new Set(["widget"])]]),
      existingCohortDocDirs: new Set(),
    };
    const result = validateFiles(Object.keys(files), fakeReader(files), live);
    expect(result.pass).toBe(false);
    expect(result.diagnostics.some((d) => /cohort-core\.md/.test(d))).toBe(true);
  });
});
