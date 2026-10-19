/** Shared scripted inputs for project and identity status renders. */
import { vi } from "vitest";
import type { ExecResult, GitExec } from "../../src/lib/git/exec.js";
import type { ProjectReadinessRecordCandidate } from "../../src/lib/status/project-view.js";
import { worktreePorcelainZ } from "./worktree-porcelain.js";

export function meta(slug: string, state: string, fields: { owner?: string; priority?: string; cohort?: string; dependsOn?: string } = {}): string {
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

export function oracleMeta(
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
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    `| ${fields.state ?? "Active"} | ${fields.owner ?? "andrew"} | ${fields.branch} | — | ${fields.priority ?? "[none]"} |`,
    "",
    `- **Cohort:** ${fields.cohort ?? "[none]"}`,
    `- **Depends On:** ${fields.dependsOn ?? "[none]"}`,
    "",
    "---",
  ].join("\n");
}

export function makeInFlightExec(opts: {
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
    if (args[0] === "worktree") {
      return { stdout: worktreePorcelainZ(worktreeList), stderr: "" };
    }
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

export function record(
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

export function inFlightRecord(
  slug: string,
  fields: Partial<ProjectReadinessRecordCandidate> = {},
): ProjectReadinessRecordCandidate {
  return record(slug, {
    location: "active",
    source: {
      kind: "in-flight-meta",
      location: "active",
      path: `origin/feat/${slug}:.arc/active/meta-${slug}.md`,
    },
    ...fields,
  });
}

/** A meta body carrying the fields the oracle reads. */
export function metaContent(
  fields: {
    state?: string;
    owner?: string;
    branch?: string;
    cohort?: string;
    class?: string;
    priority?: string;
    dependsOn?: string;
  } = {},
): string {
  return [
    "# Metadata: x",
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    `| ${fields.state ?? "Active"} | ${fields.owner ?? "andrew"} | ${fields.branch ?? "__BRANCH__"} | ` +
      `${fields.class ?? "—"} | ${fields.priority ?? "[none]"} |`,
    "",
    `- **Depends On:** ${fields.dependsOn ?? "[none]"}`,
    `- **Cohort:** ${fields.cohort ?? "[none]"}`,
    "",
    "---",
  ].join("\n");
}

/**
 * Exec stub answering every read the view makes: `ls-remote` (membership),
 * `for-each-ref` (local tracking refs), `worktree list`, and `git show` (meta).
 */
export function makeExec(opts: {
  lsRemote?: string | "throw";
  forEachRef?: string;
  metas?: Record<string, string>;
  worktrees?: Array<{ path: string; branch: string }>;
}): GitExec {
  const metas = opts.metas ?? {};
  const worktreeList = (opts.worktrees ?? [])
    .map((wt) => [
      `worktree ${wt.path}`,
      "HEAD 1111111111111111111111111111111111111111",
      `branch refs/heads/${wt.branch}`,
    ].join("\n"))
    .join("\n\n");
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "ls-remote") {
      if (opts.lsRemote === "throw") throw new Error("fatal: could not read from remote");
      return { stdout: opts.lsRemote ?? "", stderr: "" };
    }
    if (args[0] === "for-each-ref") return { stdout: opts.forEachRef ?? "", stderr: "" };
    if (args[0] === "worktree") {
      return { stdout: worktreePorcelainZ(worktreeList), stderr: "" };
    }
    if (args[0] === "ls-tree" && args.includes("--name-only")) {
      const ref = args[args.indexOf("--name-only") + 1] ?? "";
      const paths = Object.keys(metas)
        .filter((target) => target.startsWith(`${ref}:`))
        .map((target) => target.slice(target.indexOf(":") + 1));
      return { stdout: paths.join("\n"), stderr: "" };
    }
    if (args[0] === "show") {
      const target = args[1] ?? "";
      if (target in metas) {
        const ref = target.slice(0, target.indexOf(":"));
        const branch = ref.startsWith("origin/") ? ref.slice("origin/".length) : ref;
        return { stdout: (metas[target] ?? "").replaceAll("__BRANCH__", branch), stderr: "" };
      }
      throw new Error(`fatal: path does not exist in '${target}'`);
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
}
