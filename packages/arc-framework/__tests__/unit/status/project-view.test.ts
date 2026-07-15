import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { describe, it, expect, afterEach, vi } from "vitest";

import {
  composeProjectReadinessView,
  composeProjectReadinessViewResult,
  depsOnlyReadinessProvider,
  mergeProjectReadinessRecords,
  resolveProjectReadinessViewInput,
  type ProjectReadinessProvider,
  type ProjectReadinessRecordCandidate,
} from "../../../src/lib/status/project-view.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";

let root: string | undefined;

async function writeMeta(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function meta(slug: string, state: string, fields: { owner?: string; priority?: string; cohort?: string; dependsOn?: string } = {}): string {
  const owner = fields.owner ?? "andrew";
  const priority = fields.priority ?? "P3";
  const cohort = fields.cohort ?? "[none]";
  const dependsOn = fields.dependsOn ?? "[none]";
  return [
    `# Metadata: ${slug}`,
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    `| \`${state}\` | \`${owner}\` | [none] | \`Heavy\` | \`${priority}\` |`,
    "",
    `- **Cohort:** ${cohort}`,
    `- **Depends On:** ${dependsOn}`,
    "",
    "---",
    "",
  ].join("\n");
}

function oracleMeta(
  fields: {
    state?: string;
    owner?: string;
    branch: string;
    priority?: string;
    cohort?: string;
    dependsOn?: string;
  },
): string {
  return [
    "# Metadata: oracle",
    "",
    `- **State:** ${fields.state ?? "Active"}`,
    `- **Owner:** ${fields.owner ?? "andrew"}`,
    `- **Branch:** ${fields.branch}`,
    `- **Priority:** ${fields.priority ?? "[none]"}`,
    `- **Cohort:** ${fields.cohort ?? "[none]"}`,
    `- **Depends On:** ${fields.dependsOn ?? "[none]"}`,
    "",
    "---",
  ].join("\n");
}

function makeInFlightExec(opts: {
  remoteRefs?: string[];
  worktrees?: Array<{ path: string; branch: string }>;
  metas?: Record<string, string>;
}): GitExec {
  const metas = opts.metas ?? {};
  const remoteRefs = opts.remoteRefs ?? [];
  const worktreeList = (opts.worktrees ?? [])
    .map((worktree) => [
      `worktree ${worktree.path}`,
      "HEAD 1111111111111111111111111111111111111111",
      `branch refs/heads/${worktree.branch}`,
    ].join("\n"))
    .join("\n\n");
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "for-each-ref") {
      return {
        stdout: remoteRefs.map((branch) => `refs/remotes/origin/${branch}\tsha-${branch}`).join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "worktree") return { stdout: worktreeList, stderr: "" };
    if (args[0] === "ls-remote") throw new Error("local-ref project render must not read the network");
    if (args[0] === "ls-tree" && args.includes("--name-only")) {
      const ref = args[args.indexOf("--name-only") + 1] ?? "";
      const paths = Object.keys(metas)
        .filter((target) => target.startsWith(`${ref}:`))
        .map((target) => target.slice(target.indexOf(":") + 1));
      return { stdout: paths.join("\n"), stderr: "" };
    }
    if (args[0] === "show") {
      const target = args[1] ?? "";
      if (target in metas) return { stdout: metas[target] ?? "", stderr: "" };
      return { stdout: "", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  });
}

describe("composeProjectReadinessView", () => {
  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("renders active, ready, and blocked tiers deterministically from meta files", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    await writeMeta(
      join(root, ".arc", "active", "meta-active-alpha.md"),
      meta("active-alpha", "Active", { priority: "P1", cohort: "agile-parallelism" }),
    );
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "ready-beta", "meta-ready-beta.md"),
      meta("ready-beta", "Planning", { priority: "P2" }),
    );
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "blocked-gamma", "meta-blocked-gamma.md"),
      meta("blocked-gamma", "Planning", { dependsOn: "`ready-beta`" }),
    );
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "blocked-delta", "meta-blocked-delta.md"),
      meta("blocked-delta", "Planning", { dependsOn: "`blocked-gamma`" }),
    );

    const input = await resolveProjectReadinessViewInput({
      cwd: root,
      title: "Roadmap: Test Project",
    });
    const view = composeProjectReadinessView({
      ...input,
      renderedRef: "abc1234",
    });

    expect(view).toContain("# Roadmap: Test Project");
    expect(view).toContain("Last rendered against `abc1234`");
    expect(view).toContain("| `Active` | active-alpha | P1");
    expect(view).toContain("## Ready");
    expect(view).toContain("| ready-beta | P2");
    expect(view).toContain("## Blocked");
    expect(view).toContain("### Depth 1");
    const depth1Section = view.slice(view.indexOf("### Depth 1"), view.indexOf("### Depth 2"));
    expect(depth1Section).toContain("| blocked-gamma | P3");
    expect(depth1Section).toContain("ready-beta");
    expect(view).toContain("### Depth 2");
    const depth2Section = view.slice(view.indexOf("### Depth 2"));
    expect(depth2Section).toContain("| blocked-delta | P3");
    expect(depth2Section).toContain("blocked-gamma");
  });

  it("renders from injected records without reading the filesystem", () => {
    const view = composeProjectReadinessView({
      renderedRef: "abc1234",
      title: "Roadmap: Injected",
      records: mergeProjectReadinessRecords([
        record("active-alpha", { location: "active", state: "Active", priority: "P1" }),
        record("ready-beta", { location: "planned", dependsOn: [], priority: "P2" }),
        record("blocked-gamma", { location: "planned", dependsOn: ["active-alpha"] }),
      ]),
    });

    expect(view).toContain("# Roadmap: Injected");
    expect(view).toContain("| `Active` | active-alpha | P1");
    expect(view).toContain("| ready-beta | P2");
    expect(view).toContain("| blocked-gamma | P3");
  });

  it("uses the default title without reading the existing ROADMAP", async () => {
    const readPaths: string[] = [];

    const input = await resolveProjectReadinessViewInput({
      cwd: "/repo",
      fs: {
        readdir: async () => [],
        readFile: async (path) => {
          readPaths.push(path);
          throw new Error(`unexpected read: ${path}`);
        },
      },
    });

    expect(input.title).toBe("Roadmap: Project Status");
    expect(readPaths).toEqual([]);
  });

  it("resolves local-ref active metas ahead of planned tree stubs", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "local-live", "meta-local-live.md"),
      meta("local-live", "Planning", { priority: "P3" }),
    );
    const exec = makeInFlightExec({
      worktrees: [{ path: root, branch: "feat/local-live" }],
      metas: {
        "feat/local-live:.arc/active/meta-local-live.md": oracleMeta({
          branch: "feat/local-live",
          priority: "P1",
        }),
      },
    });

    const input = await resolveProjectReadinessViewInput({
      cwd: root,
      title: "Roadmap",
      localRefs: { exec, baseBranch: "main" },
    });
    const view = composeProjectReadinessView({
      ...input,
      renderedRef: "abc1234",
    });

    expect(view).toContain("| `Active` | local-live | P1");
    expect(sectionBetween(view, "## Ready", "## Blocked")).not.toContain("local-live");
  });

  it("lets a prospective shipped record replace both own-branch oracle ref forms", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    const slug = "archiving";
    const branch = `feat/${slug}`;
    await writeMeta(
      join(root, ".arc", "completed", "2026-q3", `meta-${slug}.md`),
      meta(slug, "Shipped", { priority: "P2" }),
    );
    const exec = makeInFlightExec({
      remoteRefs: [branch],
      worktrees: [{ path: root, branch }],
      metas: {
        [`origin/${branch}:.arc/active/meta-${slug}.md`]: oracleMeta({
          branch,
          state: "Integrating",
          priority: "P1",
        }),
        [`${branch}:.arc/active/meta-${slug}.md`]: oracleMeta({
          branch,
          state: "Integrating",
          priority: "P1",
        }),
      },
    });

    const input = await resolveProjectReadinessViewInput({
      cwd: root,
      localRefs: { exec, baseBranch: "main" },
      prospective: { currentBranch: branch },
    });

    expect(input.records.find((record) => record.slug === slug)).toMatchObject({
      location: "completed",
      state: "Shipped",
      priority: "P2",
    });
  });

  it.each([
    ["Active", "Planning"],
    ["Integrating", "Active"],
  ])("lets a prospective %s record replace the own branch's pre-commit %s state", async (staged, atRef) => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    const slug = `transition-${staged.toLowerCase()}`;
    const branch = `feat/${slug}`;
    await writeMeta(join(root, ".arc", "active", `meta-${slug}.md`), meta(slug, staged, { priority: "P2" }));
    const exec = makeInFlightExec({
      worktrees: [{ path: root, branch }],
      metas: {
        [`${branch}:.arc/active/meta-${slug}.md`]: oracleMeta({
          branch,
          state: atRef,
          priority: "P1",
        }),
      },
    });

    const input = await resolveProjectReadinessViewInput({
      cwd: root,
      localRefs: { exec, baseBranch: "main" },
      prospective: { currentBranch: branch },
    });

    expect(input.records.find((record) => record.slug === slug)).toMatchObject({
      location: "active",
      state: staged,
      priority: "P2",
    });
  });

  it("suppresses own-branch residue when the prospective tree contains that work unit", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    const slug = "starting";
    const branch = `plan/${slug}`;
    await writeMeta(join(root, ".arc", "active", `meta-${slug}.md`), meta(slug, "Planning"));
    const exec = makeInFlightExec({ worktrees: [{ path: root, branch }] });

    const normal = await resolveProjectReadinessViewInput({
      cwd: root,
      localRefs: { exec, baseBranch: "main" },
    });
    const prospective = await resolveProjectReadinessViewInput({
      cwd: root,
      localRefs: { exec, baseBranch: "main" },
      prospective: { currentBranch: branch },
    });

    expect(normal.sourceWarnings).toContainEqual(expect.objectContaining({
      rendered: expect.stringContaining("cleanup may be required"),
    }));
    expect(prospective.sourceWarnings).not.toContainEqual(expect.objectContaining({
      rendered: expect.stringContaining("cleanup may be required"),
    }));
  });

  it("keeps a genuine live sibling ahead of its completed tree record", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    const ownSlug = "own-transition";
    const ownBranch = `feat/${ownSlug}`;
    const siblingSlug = "live-sibling";
    const siblingBranch = `feat/${siblingSlug}`;
    await writeMeta(
      join(root, ".arc", "active", `meta-${ownSlug}.md`),
      meta(ownSlug, "Integrating", { priority: "P2" }),
    );
    await writeMeta(
      join(root, ".arc", "completed", "2026-q3", `meta-${siblingSlug}.md`),
      meta(siblingSlug, "Shipped", { priority: "P3" }),
    );
    const exec = makeInFlightExec({
      remoteRefs: [siblingBranch],
      worktrees: [{ path: root, branch: ownBranch }],
      metas: {
        [`origin/${siblingBranch}:.arc/active/meta-${siblingSlug}.md`]: oracleMeta({
          branch: siblingBranch,
          state: "Active",
          priority: "P1",
        }),
      },
    });

    const input = await resolveProjectReadinessViewInput({
      cwd: root,
      localRefs: { exec, baseBranch: "main" },
      prospective: { currentBranch: ownBranch },
    });

    expect(input.records.find((record) => record.slug === siblingSlug)).toMatchObject({
      location: "active",
      state: "Active",
      priority: "P1",
    });
  });

  it("renders a no-transition prospective tree byte-identically to normal precedence", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    const slug = "stable-own-branch";
    const branch = `feat/${slug}`;
    const staleSiblingBranch = "feat/stale-sibling";
    await writeMeta(join(root, ".arc", "active", `meta-${slug}.md`), meta(slug, "Active", { priority: "P1" }));
    const exec = makeInFlightExec({
      remoteRefs: [staleSiblingBranch],
      worktrees: [{ path: root, branch }],
      metas: {
        [`${branch}:.arc/active/meta-${slug}.md`]: oracleMeta({ branch, state: "Active", priority: "P1" }),
        [`origin/${staleSiblingBranch}:.arc/active/meta-stale-sibling.md`]: oracleMeta({
          branch: "feat/actual-sibling",
          state: "Active",
        }),
      },
    });

    const [normal, prospective] = await Promise.all([
      resolveProjectReadinessViewInput({ cwd: root, localRefs: { exec, baseBranch: "main" } }),
      resolveProjectReadinessViewInput({
        cwd: root,
        localRefs: { exec, baseBranch: "main" },
        prospective: { currentBranch: branch },
      }),
    ]);

    expect(composeProjectReadinessView({ ...prospective, renderedRef: "abc1234" }))
      .toBe(composeProjectReadinessView({ ...normal, renderedRef: "abc1234" }));
    expect(prospective.derivationWarnings).toEqual(normal.derivationWarnings);
  });

  it("keeps a local-ref work unit parked when the tree carries a park pointer", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "shelved", "meta-shelved.md"),
      meta("shelved", "Active", { priority: "P3" }),
    );
    const exec = makeInFlightExec({
      worktrees: [{ path: root, branch: "feat/shelved" }],
      metas: {
        "feat/shelved:.arc/active/meta-shelved.md": oracleMeta({
          branch: "feat/shelved",
          priority: "P1",
        }),
      },
    });

    const input = await resolveProjectReadinessViewInput({
      cwd: root,
      title: "Roadmap",
      localRefs: { exec, baseBranch: "main", parkedSlugs: new Set(["shelved"]) },
    });
    const view = composeProjectReadinessView({ ...input, renderedRef: "abc1234" });

    expect(view).toContain("## Parked");
    expect(view).toContain("| shelved   | P1");
    expect(view).not.toContain("| `Active` | shelved");
  });

  it("renders byte-identical output for the same tree and local refs", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "ready", "meta-ready.md"),
      meta("ready", "Planning", { priority: "P2" }),
    );
    const exec = makeInFlightExec({
      worktrees: [{ path: root, branch: "feat/local" }],
      metas: {
        "feat/local:.arc/active/meta-local.md": oracleMeta({
          branch: "feat/local",
          priority: "P1",
        }),
      },
    });

    const first = await resolveProjectReadinessViewInput({
      cwd: root,
      title: "Roadmap",
      localRefs: { exec, baseBranch: "main" },
    });
    const second = await resolveProjectReadinessViewInput({
      cwd: root,
      title: "Roadmap",
      localRefs: { exec, baseBranch: "main" },
    });

    expect(composeProjectReadinessView({ ...first, renderedRef: "abc1234" }))
      .toEqual(composeProjectReadinessView({ ...second, renderedRef: "abc1234" }));
  });

  it("returns degraded local-ref warnings without adding them to the rendered document", async () => {
    const exec = makeInFlightExec({
      worktrees: [{ path: "/repo", branch: "feat/bad-state" }],
      metas: {
        "feat/bad-state:.arc/active/meta-bad-state.md": oracleMeta({
          branch: "feat/bad-state",
          state: "Paused",
        }),
      },
    });

    const input = await resolveProjectReadinessViewInput({
      cwd: "/repo",
      title: "Roadmap",
      fs: { readdir: async () => [], readFile: async () => "" },
      localRefs: { exec, baseBranch: "main" },
    });
    const result = composeProjectReadinessViewResult({ ...input, renderedRef: "abc1234" });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "oracle-degraded",
        rendered: expect.stringContaining("unrecognized State"),
      }),
    ]);
    expect(result.markdown).not.toContain("## Warnings");
    expect(result.markdown).not.toContain("unrecognized State");
    expect(result.markdown).not.toContain("bad-state |");
  });

  it("marks the resolver input indeterminate when local refs move mid-derivation", async () => {
    let refReads = 0;
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (args[0] === "for-each-ref") {
        refReads += 1;
        return {
          stdout: `refs/heads/feat/moving\t${refReads === 1 ? "1111111" : "2222222"}`,
          stderr: "",
        };
      }
      if (args[0] === "worktree") {
        return {
          stdout: [
            "worktree /repo",
            "HEAD 1111111111111111111111111111111111111111",
            "branch refs/heads/feat/moving",
          ].join("\n"),
          stderr: "",
        };
      }
      if (args[0] === "ls-tree") {
        return { stdout: ".arc/active/meta-moving.md", stderr: "" };
      }
      if (args[0] === "show") {
        return {
          stdout: oracleMeta({ branch: "feat/moving" }),
          stderr: "",
        };
      }
      return { stdout: "", stderr: "" };
    });

    const input = await resolveProjectReadinessViewInput({
      cwd: "/repo",
      title: "Roadmap",
      fs: { readdir: async () => [], readFile: async () => "" },
      localRefs: { exec, baseBranch: "main" },
    });

    expect(input.indeterminate).toBe(true);
    expect(input.sourceWarnings.some((warning) => warning.rendered.includes("changed during"))).toBe(true);
  });

  it("returns a generic degraded warning when the source only marks indeterminate", () => {
    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: [],
      indeterminate: true,
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "oracle-degraded",
        rendered: expect.stringContaining("indeterminate"),
      }),
    ]);
    expect(result.markdown).not.toContain("In-flight inputs were indeterminate during derivation");
  });

  it("notes live-oracle fallback when the remote is unreachable", async () => {
    const exec = makeInFlightExec({
      remoteRefs: ["feat/ref-only"],
      metas: {
        "origin/feat/ref-only:.arc/active/meta-ref-only.md": oracleMeta({
          branch: "feat/ref-only",
          priority: "P1",
        }),
      },
    });

    const input = await resolveProjectReadinessViewInput({
      cwd: "/repo",
      title: "Roadmap",
      fs: { readdir: async () => [], readFile: async () => "" },
      oracle: { exec, baseBranch: "main" },
    });
    const result = composeProjectReadinessViewResult({ ...input, renderedRef: "abc1234" });

    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: "oracle-degraded",
      rendered: "Remote unreachable; rendering project view from local refs only.",
    }));
    expect(result.markdown).not.toContain("Remote unreachable; rendering project view from local refs only.");
    expect(result.markdown).toContain("| `Active` | ref-only");
    expect(result.markdown).toContain("| ref-only  | P1");
  });

  it("renders the source scope and live-view pointer in the header", () => {
    const view = composeProjectReadinessView({
      renderedRef: {
        ref: "abc1234",
        scope: "tree + local refs",
        liveView: "arc status --project",
      },
      title: "Roadmap",
      records: [],
      derivationWarnings: [],
    });

    expect(view).toContain("Last rendered against `abc1234`");
    expect(view).toContain("Source scope: tree + local refs.");
    expect(view).toContain("Live view: `arc status --project`.");
    expect(view.split("\n").filter((line) => line.startsWith("> "))).toEqual([
      "> **Generated from meta files — re-render at ceremony boundaries.** Last rendered against `abc1234`.",
      "> Source scope: tree + local refs. Live view: `arc status --project`.",
    ]);
    expect(view.split("\n").every((line) => line.length <= 120)).toBe(true);
  });
});

describe("mergeProjectReadinessRecords", () => {
  it("lets an at-ref active meta supersede a backlog stub", () => {
    const records = mergeProjectReadinessRecords([
      record("superseded", {
        location: "planned",
        owner: "stub-owner",
        priority: "P3",
        cohort: "old-cohort",
      }),
      record("superseded", {
        location: "active",
        owner: "active-owner",
        priority: "P1",
        cohort: "new-cohort",
      }),
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        slug: "superseded",
        location: "active",
        owner: "active-owner",
        priority: "P1",
        cohort: "new-cohort",
        source: expect.objectContaining({ kind: "active-meta" }),
        sources: expect.arrayContaining([
          expect.objectContaining({ kind: "active-meta" }),
          expect.objectContaining({ kind: "backlog-stub" }),
        ]),
      }),
    ]);
  });

  it("keeps backlog-only records from their stub", () => {
    const records = mergeProjectReadinessRecords([
      record("backlog-only", { location: "planned", owner: "andrew", priority: "P2" }),
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        slug: "backlog-only",
        location: "planned",
        owner: "andrew",
        priority: "P2",
        source: expect.objectContaining({ kind: "backlog-stub" }),
      }),
    ]);
  });

  it("uses backlog parking for tier membership while keeping active row fields", () => {
    const records = mergeProjectReadinessRecords([
      record("shelved", {
        location: "planned",
        state: "Active",
        owner: "stub-owner",
        priority: "P3",
      }),
      record("shelved", {
        location: "active",
        state: "Active",
        owner: "active-owner",
        priority: "P1",
      }),
    ]);
    const view = composeProjectReadinessView({
      renderedRef: "abc1234",
      title: "Roadmap",
      records,
    });

    expect(records).toEqual([
      expect.objectContaining({
        slug: "shelved",
        location: "planned",
        scheduling: "parked",
        owner: "active-owner",
        priority: "P1",
      }),
    ]);
    expect(view).toContain("## Parked");
    expect(view).toContain("| shelved   | P1       | active-owner");
    expect(view).not.toContain("| `Active` | shelved");
  });

  it("does not filter another identity's active meta from project scope", () => {
    const records = mergeProjectReadinessRecords([
      record("theirs", { location: "planned", owner: "andrew" }),
      record("theirs", { location: "active", owner: "blair" }),
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        slug: "theirs",
        location: "active",
        owner: "blair",
      }),
    ]);
  });

  it("uses deterministic precedence for any source combination", () => {
    const records = mergeProjectReadinessRecords([
      record("combo", { location: "completed", state: "Shipped", priority: "P3" }),
      record("combo", { location: "provisional", priority: "P2" }),
      record("combo", { location: "planned", priority: "P1" }),
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        slug: "combo",
        location: "planned",
        priority: "P1",
        sources: [
          expect.objectContaining({ location: "planned" }),
          expect.objectContaining({ location: "provisional" }),
          expect.objectContaining({ location: "completed" }),
        ],
      }),
    ]);
  });
});

describe("project-readiness dependency classification", () => {
  it("warns for a dangling dependency and treats it as unsatisfied", () => {
    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("ready-control", { location: "planned", dependsOn: [] }),
        record("typo-blocked", { location: "planned", dependsOn: ["ghost-dep"] }),
      ]),
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "dangling-dependency",
        workUnit: "typo-blocked",
        dependency: "ghost-dep",
      }),
    ]);
    expect(result.markdown).not.toContain("## Warnings");
    expect(result.markdown).not.toContain("depends on missing work unit");
    expect(result.markdown).toContain("ghost-dep");
    const readySection = sectionBetween(result.markdown, "## Ready", "## Blocked");
    expect(readySection).toContain("ready-control");
    expect(readySection).not.toContain("typo-blocked");
    const blockedSection = result.markdown.slice(result.markdown.indexOf("## Blocked"));
    expect(blockedSection).toContain("typo-blocked");
    expect(blockedSection).toContain("ghost-dep");
  });

  it("satisfies dependencies that resolve shipped from completed records", () => {
    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("done-dep", { location: "completed", state: "Shipped" }),
        record("ready-after-ship", { location: "planned", dependsOn: ["done-dep"] }),
      ]),
    });

    expect(result.warnings).toEqual([]);
    const readySection = sectionBetween(result.markdown, "## Ready", "## Blocked");
    expect(readySection).toContain("ready-after-ship");
    expect(readySection).not.toContain("done-dep");
    expect(result.markdown).not.toContain("### Depth 1");
  });

  it("keeps pending, parked, and at-ref active dependencies unsatisfied", () => {
    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("pending-dep", { location: "planned", state: "Planning" }),
        record("parked-dep", { location: "planned", state: "Active" }),
        record("active-dep", { location: "active", state: "Active" }),
        record("waits-pending", { location: "planned", dependsOn: ["pending-dep"] }),
        record("waits-parked", { location: "planned", dependsOn: ["parked-dep"] }),
        record("waits-active", { location: "planned", dependsOn: ["active-dep"] }),
      ]),
    });

    const readySection = sectionBetween(result.markdown, "## Ready", "## Blocked");
    expect(readySection).not.toContain("waits-pending");
    expect(readySection).not.toContain("waits-parked");
    expect(readySection).not.toContain("waits-active");
    const blockedSection = sectionBetween(result.markdown, "## Blocked", "## Parked");
    expect(blockedSection).toContain("waits-pending");
    expect(blockedSection).toContain("pending-dep");
    expect(blockedSection).toContain("waits-parked");
    expect(blockedSection).toContain("parked-dep");
    expect(blockedSection).toContain("waits-active");
    expect(blockedSection).toContain("active-dep");
  });

  it("elevates stale-location derivation warnings only for unshipped work", () => {
    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("live-drift", { location: "active", state: "Active" }),
        record("shipped-drift", { location: "completed", state: "Shipped" }),
      ]),
      derivationWarnings: [
        {
          code: "stale-location-dropped",
          workUnit: "live-drift",
          rendered: "Meta `meta-live-drift.md` at `main` points to `feat/live-drift`; dropped stale location.",
        },
        {
          code: "stale-location-dropped",
          workUnit: "shipped-drift",
          rendered: "Meta `meta-shipped-drift.md` at `main` points to `feat/shipped-drift`; dropped stale location.",
        },
      ],
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "stale-location-unshipped",
        workUnit: "live-drift",
      }),
    ]);
    expect(result.markdown).toContain("live-drift");
    expect(result.markdown).not.toContain("shipped-drift.md");
  });
});

describe("project-readiness provider socket", () => {
  it("carries dependency satisfaction and readiness as independent facts", () => {
    const readyProvider: ProjectReadinessProvider = {
      resolve: (records) => new Map(records.map((item) => [item.slug, "ready" as const])),
    };

    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("independent-facts", { location: "planned", dependsOn: ["ghost-dep"] }),
      ]),
      readinessProvider: readyProvider,
    });

    expect(result.facts).toEqual([
      {
        slug: "independent-facts",
        dependencySatisfaction: "unsatisfied",
        readiness: "ready",
        unsatisfiedDependencies: ["ghost-dep"],
      },
    ]);
    const readySection = sectionBetween(result.markdown, "## Ready", "## Blocked");
    expect(readySection).not.toContain("independent-facts");
    expect(result.markdown).toContain("independent-facts");
  });

  it("lets a provider change readiness without changing dependency satisfaction", () => {
    const blockingProvider: ProjectReadinessProvider = {
      resolve: (records) =>
        new Map(records.map((item) => [item.slug, item.slug === "provider-blocked" ? "blocked" as const : "ready" as const])),
    };

    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("provider-ready", { location: "planned" }),
        record("provider-blocked", { location: "planned" }),
      ]),
      readinessProvider: blockingProvider,
    });

    expect(result.facts).toEqual([
      {
        slug: "provider-blocked",
        dependencySatisfaction: "satisfied",
        readiness: "blocked",
        unsatisfiedDependencies: [],
      },
      {
        slug: "provider-ready",
        dependencySatisfaction: "satisfied",
        readiness: "ready",
        unsatisfiedDependencies: [],
      },
    ]);
    const readySection = sectionBetween(result.markdown, "## Ready", "## Blocked");
    expect(readySection).toContain("provider-ready");
    expect(readySection).not.toContain("provider-blocked");
    const blockedSection = result.markdown.slice(result.markdown.indexOf("## Blocked"));
    expect(blockedSection).toContain("provider-blocked");
  });

  it("defaults to the deps-only provider", () => {
    const options = {
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("ready", { location: "planned" }),
        record("blocked", { location: "planned", dependsOn: ["ready"] }),
      ]),
    };

    const defaultResult = composeProjectReadinessViewResult(options);
    const explicitResult = composeProjectReadinessViewResult({
      ...options,
      readinessProvider: depsOnlyReadinessProvider,
    });

    expect(defaultResult).toEqual(explicitResult);
    expect(composeProjectReadinessView(options)).toEqual(defaultResult.markdown);
  });
});

function sectionBetween(markdown: string, start: string, end: string): string {
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end, startIndex + start.length);
  return markdown.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function record(
  slug: string,
  fields: Partial<ProjectReadinessRecordCandidate> = {},
): ProjectReadinessRecordCandidate {
  return {
    slug,
    location: "planned",
    state: "Planning",
    priority: "P3",
    dependsOn: [],
    ...fields,
  };
}
