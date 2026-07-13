/**
 * Unit tests for the shared tree + in-flight lifecycle composition layer.
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";
import {
  isComposedLifecycleSlugIndeterminate,
  resolveComposedLifecycleIndex,
} from "../../../src/lib/work-unit/composed-lifecycle-index.js";
import { buildLifecycleIndex } from "../../../src/lib/work-unit/lifecycle-index.js";

let root: string | undefined;

function meta(slug: string, state: string): string {
  return [
    `# Metadata: ${slug}`,
    "",
    `- **State:** ${state}`,
    "- **Owner:** andrew",
    "- **Branch:** [none]",
    "- **Priority:** P3",
    "- **Depends On:** [none]",
    "",
  ].join("\n");
}

function oracleMeta(slug: string, branch: string, state = "Active"): string {
  return [
    `# Metadata: ${slug}`,
    "",
    `- **State:** ${state}`,
    "- **Owner:** andrew",
    `- **Branch:** ${branch}`,
    "- **Priority:** P1",
    "- **Depends On:** [none]",
    "",
  ].join("\n");
}

function makeInFlightExec(options: {
  remoteRefs?: Record<string, string>;
  remoteRefSnapshots?: Array<Record<string, string>>;
  liveRefs?: Record<string, string>;
  worktrees?: Array<{ path: string; branch: string }>;
  worktreeError?: boolean;
  metas?: Record<string, string>;
  fetchFailures?: readonly string[];
}): GitExec {
  const remoteRefs = options.remoteRefs ?? {};
  const metas = options.metas ?? {};
  const worktreeList = (options.worktrees ?? [])
    .map(({ path, branch }) => [
      `worktree ${path}`,
      "HEAD 1111111111111111111111111111111111111111",
      `branch refs/heads/${branch}`,
    ].join("\n"))
    .join("\n\n");
  let refRead = 0;
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "for-each-ref") {
      const snapshot = options.remoteRefSnapshots?.[
        Math.min(refRead++, Math.max((options.remoteRefSnapshots?.length ?? 1) - 1, 0))
      ] ?? remoteRefs;
      return {
        stdout: Object.entries(snapshot)
          .map(([branch, sha]) => `refs/remotes/origin/${branch}\t${sha}`)
          .join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "worktree") {
      if (options.worktreeError === true) throw new Error("worktree list failed");
      return { stdout: worktreeList, stderr: "" };
    }
    if (args[0] === "ls-remote") {
      if (options.liveRefs === undefined) throw new Error("network unavailable");
      return {
        stdout: Object.entries(options.liveRefs)
          .map(([branch, sha]) => `${sha}\trefs/heads/${branch}`)
          .join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "fetch") {
      const branch = args[2] ?? "";
      if (options.fetchFailures?.includes(branch) === true) throw new Error("fetch failed");
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "ls-tree" && args.includes("--name-only")) {
      const ref = args[args.indexOf("--name-only") + 1] ?? "";
      const paths = Object.keys(metas)
        .filter((target) => target.startsWith(`${ref}:`))
        .map((target) => target.slice(target.indexOf(":") + 1));
      return { stdout: paths.join("\n"), stderr: "" };
    }
    if (args[0] === "show") return { stdout: metas[args[1] ?? ""] ?? "", stderr: "" };
    return { stdout: "", stderr: "" };
  });
}

async function writeMeta(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf-8");
}

const fs = {
  readdir: (path: string) => readdir(path, { withFileTypes: true }),
  readFile: (path: string) => readFile(path, "utf-8"),
};

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("resolveComposedLifecycleIndex", () => {
  it("matches the tree-only lifecycle index when no oracle input is supplied", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    await writeMeta(join(root, ".arc", "active", "meta-active.md"), meta("active", "Active"));
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "nested", "meta-planned.md"),
      meta("planned", "Planning"),
    );

    const [tree, composed] = await Promise.all([
      buildLifecycleIndex({ cwd: root, fs }),
      resolveComposedLifecycleIndex({ cwd: root, fs }),
    ]);

    expect([...composed.index.entries()]).toEqual([...tree.entries()]);
    expect(composed.qualityFacts).toEqual({ warnings: [], resultMarks: [], bySlug: new Map() });
    expect(composed.worktreePathBySlug).toEqual(new Map());
    expect(composed.liveRefs).toEqual({});
    expect(composed.reachable).toBe(false);
  });

  it("overlays a sibling activation from local refs without reading the network", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const slug = "local-live";
    const branch = `feat/${slug}`;
    await writeMeta(
      join(root, ".arc", "backlog", "planned", slug, `meta-${slug}.md`),
      meta(slug, "Planning"),
    );
    const exec = makeInFlightExec({
      worktrees: [{ path: root, branch }],
      metas: { [`${branch}:.arc/active/meta-${slug}.md`]: oracleMeta(slug, branch) },
    });

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: true, baseBranch: "main" },
    });

    expect(result.index.get(slug)).toEqual({
      slug,
      phase: "Active",
      location: "active",
      cohort: null,
      dependsOn: [],
      path: `${branch}:.arc/active/meta-${slug}.md`,
    });
    expect(result.worktreePathBySlug.get(slug)).toBe(root);
    expect(result.qualityFacts).toEqual({ warnings: [], resultMarks: [], bySlug: new Map() });
    expect(exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["ls-remote"]), expect.anything());
  });

  it("retains reachable live membership tips for destructive consumers", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const slug = "live-member";
    const branch = `feat/${slug}`;
    const sha = "a".repeat(40);
    const exec = makeInFlightExec({
      remoteRefs: { [branch]: sha },
      liveRefs: { [branch]: sha },
      metas: { [`origin/${branch}:.arc/active/meta-${slug}.md`]: oracleMeta(slug, branch) },
    });

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: false, baseBranch: "main" },
    });

    expect(result.reachable).toBe(true);
    expect(result.liveRefs).toEqual({ [`origin/${branch}`]: sha });
    expect(result.index.get(slug)?.phase).toBe("Active");
  });

  it("expands a live-only candidate at its membership SHA only when requested", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const slug = "never-fetched";
    const branch = `feat/${slug}`;
    const otherSlug = "also-never-fetched";
    const otherBranch = `feat/${otherSlug}`;
    const sha = "b".repeat(40);
    const otherSha = "e".repeat(40);
    const exec = makeInFlightExec({
      liveRefs: { [branch]: sha, [otherBranch]: otherSha },
      metas: {
        [`${sha}:.arc/active/meta-${slug}.md`]: oracleMeta(slug, branch),
        [`${otherSha}:.arc/active/meta-${otherSlug}.md`]: oracleMeta(otherSlug, otherBranch),
      },
    });

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: false, expandLiveOnly: true, baseBranch: "main" },
    });

    expect(result.index.get(slug)?.phase).toBe("Active");
    expect(result.index.get(otherSlug)?.phase).toBe("Active");
    expect(result.qualityFacts.resultMarks).toEqual([]);
  });

  it("does not expand live-only membership unless the consumer opts in", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const branch = "feat/query-local-default";
    const exec = makeInFlightExec({ liveRefs: { [branch]: "c".repeat(40) } });

    await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: false, baseBranch: "main" },
    });

    expect(exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["fetch"]), expect.anything());
  });

  it("marks the whole result indeterminate when a live-only expansion fetch fails", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const slug = "fetch-failed";
    const branch = `feat/${slug}`;
    await writeMeta(
      join(root, ".arc", "backlog", "planned", `meta-${slug}.md`),
      meta(slug, "Planning"),
    );
    const exec = makeInFlightExec({
      liveRefs: { [branch]: "d".repeat(40) },
      fetchFailures: [branch],
    });

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: false, expandLiveOnly: true, baseBranch: "main" },
    });

    expect(result.index.get(slug)?.phase).toBe("Planning");
    expect(result.qualityFacts.resultMarks).toContain("indeterminate");
    expect(isComposedLifecycleSlugIndeterminate(result, slug)).toBe(true);
  });

  it("degrades an unreachable live oracle to tree truth with an explicit quality fact", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const slug = "tree-fallback";
    await writeMeta(
      join(root, ".arc", "backlog", "planned", `meta-${slug}.md`),
      meta(slug, "Planning"),
    );
    const exec = makeInFlightExec({});

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: false, baseBranch: "main" },
    });

    expect(result.index.get(slug)?.phase).toBe("Planning");
    expect(result.reachable).toBe(false);
    expect(result.qualityFacts).toEqual({
      warnings: [],
      resultMarks: [],
      bySlug: new Map(),
      unreachable: true,
    });
  });

  it("preserves parked overlay and active-over-completed source precedence", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const parked = "parked-live";
    const parkedBranch = `feat/${parked}`;
    const resumed = "resumed";
    await writeMeta(
      join(root, ".arc", "backlog", "planned", `meta-${parked}.md`),
      meta(parked, "Active"),
    );
    await writeMeta(join(root, ".arc", "completed", `meta-${resumed}.md`), meta(resumed, "Shipped"));
    await writeMeta(join(root, ".arc", "active", `meta-${resumed}.md`), meta(resumed, "Active"));
    const exec = makeInFlightExec({
      worktrees: [{ path: root, branch: parkedBranch }],
      metas: { [`${parkedBranch}:.arc/active/meta-${parked}.md`]: oracleMeta(parked, parkedBranch) },
    });

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: true, baseBranch: "main" },
    });

    expect(result.index.get(parked)).toMatchObject({ phase: "Active", location: "planned" });
    expect(result.index.get(resumed)).toMatchObject({ phase: "Active", location: "active" });
  });

  it("dedupes a stale planning shadow without treating its benign warning as indeterminate", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const slug = "renamed-live";
    const staleBranch = `plan/${slug}`;
    const liveBranch = `feat/${slug}`;
    const exec = makeInFlightExec({
      remoteRefs: { [staleBranch]: "a".repeat(40) },
      worktrees: [{ path: root, branch: liveBranch }],
      metas: {
        [`origin/${staleBranch}:.arc/active/meta-${slug}.md`]: oracleMeta(slug, liveBranch),
        [`${liveBranch}:.arc/active/meta-${slug}.md`]: oracleMeta(slug, liveBranch),
      },
    });

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: true, baseBranch: "main" },
    });

    expect([...result.index.keys()]).toEqual([slug]);
    expect(result.index.get(slug)?.path).toBe(`${liveBranch}:.arc/active/meta-${slug}.md`);
    expect(result.qualityFacts.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "stale-location-shadow", workUnit: slug })]),
    );
    expect(isComposedLifecycleSlugIndeterminate(result, slug)).toBe(false);
  });

  it("retains unknown-state entry facts after the lifecycle index drops the entry", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const slug = "unknown-state";
    const branch = `feat/${slug}`;
    const exec = makeInFlightExec({
      remoteRefs: { [branch]: "a".repeat(40) },
      metas: { [`origin/${branch}:.arc/active/meta-${slug}.md`]: oracleMeta(slug, branch, "Paused") },
    });

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: true, baseBranch: "main" },
    });

    expect(result.index.has(slug)).toBe(false);
    expect(result.qualityFacts.bySlug.get(slug)).toEqual({
      state: "unknown",
      marks: ["degraded"],
      warnings: [expect.objectContaining({ code: "state-unrecognized", workUnit: slug })],
    });
    expect(isComposedLifecycleSlugIndeterminate(result, slug)).toBe(true);
  });

  it("retains degradation marks for valid entries when the worktree probe fails", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const slug = "degraded-valid";
    const branch = `feat/${slug}`;
    const exec = makeInFlightExec({
      remoteRefs: { [branch]: "a".repeat(40) },
      worktreeError: true,
      metas: { [`origin/${branch}:.arc/active/meta-${slug}.md`]: oracleMeta(slug, branch) },
    });

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: true, baseBranch: "main" },
    });

    expect(result.index.get(slug)?.phase).toBe("Active");
    expect(result.qualityFacts.bySlug.get(slug)).toEqual({
      state: "Active",
      marks: ["degraded"],
      warnings: [],
    });
    expect(result.qualityFacts.warnings).toEqual([
      expect.objectContaining({ code: "worktree-list-failed" }),
    ]);
    expect(isComposedLifecycleSlugIndeterminate(result, slug)).toBe(true);
  });

  it("propagates whole-result indeterminacy when the input ref set changes", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const slug = "stable-before-churn";
    const branch = `feat/${slug}`;
    const lateBranch = "feat/late";
    const exec = makeInFlightExec({
      remoteRefSnapshots: [
        { [branch]: "a".repeat(40) },
        { [branch]: "a".repeat(40), [lateBranch]: "b".repeat(40) },
      ],
      metas: { [`origin/${branch}:.arc/active/meta-${slug}.md`]: oracleMeta(slug, branch) },
    });

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: true, baseBranch: "main" },
    });

    expect(result.qualityFacts.resultMarks).toEqual(["indeterminate"]);
    expect(result.qualityFacts.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "input-snapshot-disagreement" })]),
    );
    expect(isComposedLifecycleSlugIndeterminate(result, slug)).toBe(true);
  });

  it("propagates per-entry indeterminacy when one candidate tip changes", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-composed-index-"));
    const slug = "moving-tip";
    const branch = `feat/${slug}`;
    const exec = makeInFlightExec({
      remoteRefSnapshots: [
        { [branch]: "a".repeat(40) },
        { [branch]: "b".repeat(40) },
      ],
      metas: { [`origin/${branch}:.arc/active/meta-${slug}.md`]: oracleMeta(slug, branch) },
    });

    const result = await resolveComposedLifecycleIndex({
      cwd: root,
      fs,
      oracle: { exec, localOnly: true, baseBranch: "main" },
    });

    expect(result.qualityFacts.resultMarks).toEqual([]);
    expect(result.qualityFacts.bySlug.get(slug)?.marks).toContain("indeterminate");
    expect(isComposedLifecycleSlugIndeterminate(result, slug)).toBe(true);
  });
});
