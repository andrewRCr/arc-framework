import { describe, it, expect, vi } from "vitest";

import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import {
  ROADMAP_RERENDER_COMMAND,
  assertRoadmapRegenerated,
  createIndexProjectViewFs,
  renderRoadmapFromIndex,
  renderRoadmapFromIndexViewResult,
  resolveStagedTransitionOverlays,
  type RoadmapRegenerationAssertVerdict,
} from "../../../src/lib/status/roadmap-regeneration-assert.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";
import {
  resolveTransitionRecordRelativePath,
} from "../../../src/lib/work-unit/transition-record-store.js";
import type { TransitionRecord } from "../../../src/lib/work-unit/transition-record.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

function meta(slug: string, fields: { priority?: string } = {}): string {
  return [
    `# Metadata: ${slug}`,
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    `| \`Planning\` | \`andrew\` | [none] | \`Heavy\` | \`${fields.priority ?? "P3"}\` |`,
    "",
    "- **Cohort:** [none]",
    "- **Depends On:** [none]",
    "",
    "---",
    "",
  ].join("\n");
}

function transitionMeta(slug: string, state: string, branch: string): string {
  return [
    `# Metadata: ${slug}`,
    "",
    `- **State:** ${state}`,
    "- **Owner:** andrew",
    `- **Branch:** ${branch}`,
    "- **Priority:** P1",
    "- **Cohort:** [none]",
    "- **Depends On:** [none]",
    "",
    "---",
    "",
  ].join("\n");
}

function isStagedTransitionList(args: readonly string[]): boolean {
  return args.join("\0") === [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=AM",
    "-z",
    "--",
    ".arc/system/.internal/transitions",
  ].join("\0");
}

function transition(origin = "retired"): TransitionRecord {
  return { schemaVersion: 1, origin, kind: "decompose", successors: ["member"], edges: [] };
}

interface StagedTransition {
  record: TransitionRecord;
  path: string;
}

function makeStagedTransitionsExec(records: readonly StagedTransition[]): GitExec {
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (isStagedTransitionList(args)) {
      return { stdout: records.map(({ path }) => path).join("\0") + "\0", stderr: "" };
    }
    if (args[0] === "ls-tree" && args[2] === "HEAD") {
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "show") {
      const record = records.find(({ path }) => args[1] === `:${path}`);
      if (record !== undefined) return { stdout: canonicalize(record.record), stderr: "" };
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
}

function makeStagedTransitionExec(
  record: TransitionRecord,
  path = resolveTransitionRecordRelativePath(record.origin),
): GitExec {
  return makeStagedTransitionsExec([{ record, path }]);
}

function makeIndexExec(files: Record<string, string>): GitExec {
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (isStagedTransitionList(args)) return { stdout: "", stderr: "" };
    if (args[0] === "ls-files") {
      const dir = args.at(-1) ?? "";
      const lines = Object.keys(files)
        .filter((path) => path === dir || path.startsWith(`${dir}/`))
        .sort()
        .map((path) => `100644 object-id 0\t${path}`);
      return { stdout: lines.join("\n"), stderr: "" };
    }
    if (args[0] === "show") {
      const target = args[1] ?? "";
      if (!target.startsWith(":")) throw new Error(`unexpected show target: ${target}`);
      const path = target.slice(1);
      const content = files[path];
      if (content === undefined) throw new Error(`missing index file: ${path}`);
      return { stdout: content, stderr: "" };
    }
    if (args[0] === "for-each-ref" || args[0] === "worktree") {
      return { stdout: "", stderr: "" };
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
}

function makeTransitionExec(
  files: Record<string, string>,
  input: { branch: string; slug: string; atRefState: string },
): GitExec {
  const metaPath = `.arc/active/meta-${input.slug}.md`;
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (isStagedTransitionList(args)) return { stdout: "", stderr: "" };
    if (args[0] === "ls-files") {
      const dir = args.at(-1) ?? "";
      return {
        stdout: Object.keys(files)
          .filter((path) => path === dir || path.startsWith(`${dir}/`))
          .sort()
          .map((path) => `100644 object-id 0\t${path}`)
          .join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "show") {
      const target = args[1] ?? "";
      if (target.startsWith(":")) {
        const content = files[target.slice(1)];
        if (content === undefined) throw new Error(`missing index file: ${target.slice(1)}`);
        return { stdout: content, stderr: "" };
      }
      if (target === `${input.branch}:${metaPath}`) {
        return { stdout: transitionMeta(input.slug, input.atRefState, input.branch), stderr: "" };
      }
    }
    if (args[0] === "for-each-ref") {
      return { stdout: `refs/heads/${input.branch}\t${"1".repeat(40)}`, stderr: "" };
    }
    if (args[0] === "worktree") {
      return {
        stdout: worktreePorcelainZ(
          `worktree /repo\nHEAD ${"1".repeat(40)}\nbranch refs/heads/${input.branch}\n`,
        ),
        stderr: "",
      };
    }
    if (args[0] === "ls-tree") return { stdout: metaPath, stderr: "" };
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
}

function messageFor(
  verdict: RoadmapRegenerationAssertVerdict,
  status: Exclude<RoadmapRegenerationAssertVerdict["status"], "pass">,
): string {
  expect(verdict.status).toBe(status);
  if (verdict.status === "pass") throw new Error("expected a diagnostic verdict");
  return verdict.message;
}

describe("assertRoadmapRegenerated", () => {
  it("rejects a determinate mismatch with the re-render instruction", () => {
    const verdict = assertRoadmapRegenerated({
      stagedContent: "hand edit\n",
      renderedContent: "rendered\n",
      indeterminate: false,
    });

    expect(messageFor(verdict, "reject-mismatch")).toContain(ROADMAP_RERENDER_COMMAND);
  });

  it("rejects conflict markers even when the render is indeterminate", () => {
    const verdict = assertRoadmapRegenerated({
      stagedContent: "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n",
      renderedContent: "rendered\n",
      indeterminate: true,
    });

    expect(messageFor(verdict, "reject-markers")).toContain(ROADMAP_RERENDER_COMMAND);
  });

  it("warns and allows an indeterminate mismatch", () => {
    const verdict = assertRoadmapRegenerated({
      stagedContent: "staged\n",
      renderedContent: "rendered\n",
      indeterminate: true,
    });

    expect(messageFor(verdict, "warn-and-allow")).toContain(ROADMAP_RERENDER_COMMAND);
  });

  it("passes byte-identical content", () => {
    expect(assertRoadmapRegenerated({
      stagedContent: "rendered\n",
      renderedContent: "rendered\n",
      indeterminate: false,
    })).toEqual({ status: "pass" });
  });
});

describe("createIndexProjectViewFs", () => {
  it("lists and reads meta files from the staged index", async () => {
    const exec = makeIndexExec({
      ".arc/backlog/planned/ready/meta-ready.md": meta("ready", { priority: "P1" }),
    });
    const fs = createIndexProjectViewFs({ cwd: "/repo", exec });

    const entries = await fs.readdir("/repo/.arc/backlog/planned");
    const ready = entries.find((entry) => entry.name === "ready");

    expect(ready?.isDirectory()).toBe(true);
    await expect(fs.readFile("/repo/.arc/backlog/planned/ready/meta-ready.md")).resolves.toContain("P1");
    expect(exec).toHaveBeenCalledWith("git", [
      "show",
      ":.arc/backlog/planned/ready/meta-ready.md",
    ], { cwd: "/repo" });
  });
});

describe("resolveStagedTransitionOverlays", () => {
  it("derives suppression authority from a path-bound decomposition transition", async () => {
    const record = transition();

    await expect(resolveStagedTransitionOverlays({
      cwd: "/repo",
      exec: makeStagedTransitionExec(record),
    })).resolves.toMatchObject([{
      kind: "validated",
      origin: record.origin,
      sourceBranch: "plan/retired",
    }]);
  });

  it("derives direct-transition suppression from the origin meta branch at HEAD", async () => {
    const record: TransitionRecord = {
      schemaVersion: 1,
      origin: "retired",
      kind: "rename",
      successors: ["renamed"],
      edges: [],
    };
    const path = resolveTransitionRecordRelativePath(record.origin);
    const metaPath = ".arc/backlog/planned/retired/meta-retired.md";
    const exec: GitExec = async (_command, args) => {
      if (isStagedTransitionList(args)) return { stdout: `${path}\0`, stderr: "" };
      if (args[0] === "show" && args[1] === `:${path}`) {
        return { stdout: canonicalize(record), stderr: "" };
      }
      if (args[0] === "ls-tree" && args[1] === "-z") return { stdout: "", stderr: "" };
      if (args[0] === "ls-tree" && args[1] === "-r") {
        return { stdout: `${metaPath}\0`, stderr: "" };
      }
      if (args[0] === "show" && args[1] === `HEAD:${metaPath}`) {
        return { stdout: transitionMeta(record.origin, "Planning", "feat/retired"), stderr: "" };
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    };

    await expect(resolveStagedTransitionOverlays({ cwd: "/repo", exec })).resolves.toMatchObject([{
      kind: "validated",
      origin: record.origin,
      sourceBranch: "feat/retired",
    }]);
  });

  it("rejects suppression authority when the staged path does not match the content origin", async () => {
    const record = transition();
    const mismatchedPath = resolveTransitionRecordRelativePath("other");

    await expect(resolveStagedTransitionOverlays({
      cwd: "/repo",
      exec: makeStagedTransitionExec(record, mismatchedPath),
    })).resolves.toEqual([]);
  });

  it("admits every terminal transition carried by one staged merge", async () => {
    const records = [
      transition(),
      transition("other"),
    ];

    await expect(resolveStagedTransitionOverlays({
      cwd: "/repo",
      exec: makeStagedTransitionsExec(records.map((record) => ({
        record,
        path: resolveTransitionRecordRelativePath(record.origin),
      }))),
    })).resolves.toMatchObject([
      { kind: "validated", origin: "retired", sourceBranch: "plan/retired" },
      { kind: "validated", origin: "other", sourceBranch: "plan/other" },
    ]);
  });

});

describe("renderRoadmapFromIndex", () => {
  it("passes when staged ROADMAP content matches the index-pinned render", async () => {
    const exec = makeIndexExec({
      ".arc/backlog/planned/ready/meta-ready.md": meta("ready", { priority: "P1" }),
    });
    const rendered = await renderRoadmapFromIndex({
      cwd: "/repo",
      exec,
      baseBranch: "main",
      renderedRef: "abc1234",
    });

    const verdict = assertRoadmapRegenerated({
      stagedContent: rendered,
      renderedContent: rendered,
      indeterminate: false,
    });

    expect(verdict.status).toBe("pass");
    expect(rendered).toMatch(/\| ready\s+\| P1\s+\|/);
  });
});

describe("renderRoadmapFromIndexViewResult", () => {
  it("composes the same markdown the pre-commit render emits, plus structured facts", async () => {
    const exec = makeIndexExec({
      ".arc/backlog/planned/ready/meta-ready.md": meta("ready", { priority: "P1" }),
    });
    const options = { cwd: "/repo", exec, baseBranch: "main", renderedRef: "abc1234" } as const;

    const view = await renderRoadmapFromIndexViewResult(options);
    const markdown = await renderRoadmapFromIndex(options);

    // The CLI's `--staged` path and the hook's assert both compose from this
    // primitive: the markdown must be byte-identical (modulo the trailing newline
    // the assert appends).
    expect(`${view.result.markdown}\n`).toBe(markdown);
    expect(view.result.facts.some((fact) => fact.slug === "ready")).toBe(true);
    expect(exec).not.toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["diff", "--cached"]),
      expect.anything(),
    );
  });

  it.each([
    ["Active", "Planning", ".arc/active/meta-transition.md", "| `Active` | transition"],
    ["Integrating", "Active", ".arc/active/meta-transition.md", "| `Integrating` | transition"],
    ["Shipped", "Integrating", ".arc/completed/2026-q3/meta-transition.md", null],
  ] as const)(
    "keeps hook and CLI markdown byte-identical for a staged %s transition over an at-ref %s state",
    async (stagedState, atRefState, path, activeRow) => {
      const branch = "feat/transition";
      const exec = makeTransitionExec(
        { [path]: transitionMeta("transition", stagedState, branch) },
        { branch, slug: "transition", atRefState },
      );
      const options = {
        cwd: "/repo",
        exec,
        baseBranch: "main",
        currentBranch: branch,
        renderedRef: "abc1234",
      } as const;

      const view = await renderRoadmapFromIndexViewResult(options);
      const hookContent = await renderRoadmapFromIndex(options);

      expect(`${view.result.markdown}\n`).toBe(hookContent);
      if (activeRow === null) expect(hookContent).not.toContain("| transition");
      else expect(hookContent).toContain(activeRow);
    },
  );
});
