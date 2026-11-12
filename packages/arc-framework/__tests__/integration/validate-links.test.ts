/**
 * Integration tests for validate-links.sh — pre-commit CHECK[markdown-links].
 *
 * The script validates markdown link targets in staged files. Tests exercise
 * it via subprocess against fixture markdown files in a temp directory.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, delimiter } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
  ".arc/system/.internal/scripts/validate-links.sh",
);

async function runScript(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number; stderr: string; stdout: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(SCRIPT_PATH, args, { cwd, env });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stderr?: string; stdout?: string };
    return { code: e.code ?? 1, stderr: e.stderr ?? "", stdout: e.stdout ?? "" };
  }
}

async function writeFixture(
  base: string,
  path: string,
  content: string,
): Promise<void> {
  const full = join(base, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

describe("validate-links.sh", () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "arc-validate-links-"));
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32").each([
    { name: "tracked", content: "[guide](/guide.md)", code: 0, diagnostic: "" },
    { name: "movable", content: "[record](.arc/active/meta-example.md)", code: 1, diagnostic: "link to movable artifact" },
    { name: "ignored", content: "[private](.arc/user/alice/private.md)", code: 1, diagnostic: "link to ignored ARC path" },
  ])("canonicalizes a Git drive-form root for $name links", async ({ name, content, code, diagnostic }) => {
    const cwd = join(tmp, `case-drive-root-${name}`);
    const root = join(cwd, "C:", "repo");
    const bin = join(cwd, "bin");
    await mkdir(root, { recursive: true });
    await mkdir(bin);
    await execFileAsync("git", ["init", "-q"], { cwd: root });
    await writeFixture(root, ".gitignore", ".arc/user/\n");
    await writeFixture(root, "guide.md", "# Guide\n");
    await writeFixture(root, ".arc/active/meta-example.md", "# Record\n");
    await writeFixture(root, ".arc/user/alice/private.md", "# Private\n");
    await writeFixture(root, "source.md", `${content}\n`);
    const realGit = (await execFileAsync("bash", ["-c", "command -v git"])).stdout.trim();
    await writeFile(join(bin, "git"), `#!/usr/bin/env bash
if [ "$1" = rev-parse ] && [ "$2" = --show-toplevel ]; then
    printf '%s\\n' 'C:/repo'
else
    exec "$ARC_LINK_TEST_GIT" "$@"
fi
`, { mode: 0o755 });
    const result = await runScript(cwd, ["C:/repo/source.md"], {
      ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, ARC_LINK_TEST_GIT: realGit,
    });
    expect(result.code, result.stderr).toBe(code);
    expect(result.stderr).toContain(diagnostic);
    if (code === 0) expect(result.stderr).toBe("");
  });

  it("refuses normalized movable targets, present or absent, before existence checks", async () => {
    const dir = join(tmp, "case-movable-targets");
    await mkdir(dir, { recursive: true });
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    for (const path of [".arc/active/meta-one.md", ".arc/backlog/planned/topic/draft-topic.md", ".arc/completed/old/cohort-group.md"]) {
      await writeFixture(dir, path, "# Target\n");
    }
    await writeFixture(dir, "README.md", [
      "[active](.arc/active/meta-one.md)",
      "[backlog](/.arc/backlog/planned/topic/draft-topic.md)",
      "[completed](.arc/reference/../completed/old/cohort-group.md)",
      "[missing](/.arc/active/./meta-missing.md)",
      "[encoded](/.arc/%61ctive/meta-one.md)",
    ].join("\n"));
    const result = await runScript(dir, ["README.md"]);
    expect(result.code).toBe(1);
    expect(result.stderr.match(/link to movable artifact/g)).toHaveLength(5);
    expect(result.stderr).toContain("README.md: link to movable artifact -> .arc/active/meta-one.md");
    expect(result.stderr).not.toContain("broken link");
  });

  it("refuses ignored ARC targets and accepts the tracked personal README on corrected retry", async () => {
    const dir = join(tmp, "case-ignored-targets");
    await mkdir(dir, { recursive: true });
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFixture(dir, ".gitignore", ".arc/user/*\n");
    await writeFixture(dir, ".git/info/exclude", ".arc/active/\n");
    await writeFixture(dir, ".arc/user/alice/private.md", "# Private\n");
    await writeFixture(dir, ".arc/user/README.md", "# Tracked user documentation\n");
    await writeFixture(dir, ".arc/active/current/README.md", "# Projected\n");
    await execFileAsync("git", ["add", "-f", ".arc/user/README.md"], { cwd: dir });
    await writeFixture(dir, "README.md", "[private](.arc/user/alice/private.md)\n[projected](/.arc/active/current/README.md)\n");
    const failed = await runScript(dir, ["README.md"]);
    expect(failed.code).toBe(1);
    expect(failed.stderr.match(/link to ignored ARC path/g)).toHaveLength(2);
    await writeFixture(dir, "README.md", "[users](/.arc/user/README.md)\n");
    expect(await runScript(dir, ["README.md"])).toMatchObject({ code: 0, stderr: "" });
  });

  it("resolves root-absolute tracked files, directories, and template counterparts from nested cwd", async () => {
    const dir = join(tmp, "case-repository-root");
    await mkdir(dir, { recursive: true });
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFixture(dir, "docs/guide.md", "# Guide\n");
    await writeFixture(dir, "rendered.template.md", "# Template\n");
    await writeFixture(dir, "nested/source.md", "[guide](/docs/./guide.md) [folder](/docs/) [template](/rendered.md)\n");
    expect(await runScript(join(dir, "nested"), ["source.md"])).toMatchObject({ code: 0, stderr: "" });
  });

  it("keeps root-prefix lookalikes and ordinary lifecycle README targets legal", async () => {
    const dir = join(tmp, "case-target-boundaries");
    await mkdir(dir, { recursive: true });
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFixture(dir, ".arc/active-other/meta-one.md", "# Lookalike\n");
    await writeFixture(dir, ".arc/active/README.md", "# Active\n");
    await writeFixture(dir, "README.md", "[lookalike](.arc/active-other/meta-one.md) [readme](.arc/active/README.md)\n");
    expect(await runScript(dir, ["README.md"])).toMatchObject({ code: 0, stderr: "" });
  });

  it("passes a valid inline link to an existing file", async () => {
    const dir = join(tmp, "case-inline-valid");
    await writeFixture(dir, "target.md", "# Target\n");
    await writeFixture(
      dir,
      "source.md",
      "See [the target](target.md) for details.\n",
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("passes a valid reference-style link resolving to an existing file", async () => {
    const dir = join(tmp, "case-ref-valid");
    await writeFixture(dir, "target.md", "# Target\n");
    await writeFixture(
      dir,
      "source.md",
      [
        "See [the target][t] for details.",
        "",
        "[t]: target.md",
        "",
      ].join("\n"),
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(0);
  });

  it("fails on an inline link to a nonexistent file — diagnostic names source and target", async () => {
    const dir = join(tmp, "case-inline-broken");
    await writeFixture(
      dir,
      "source.md",
      "See [missing](does-not-exist.md) for details.\n",
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("source.md");
    expect(r.stderr).toContain("does-not-exist.md");
  });

  it("resolves relative paths from the source file's directory, not cwd", async () => {
    // Layout:
    //   dir/docs/source.md        (source)
    //   dir/targets/target.md     (target)
    // Link from source: ../targets/target.md — resolves relative to docs/, not cwd (dir/)
    const dir = join(tmp, "case-rel-path");
    await writeFixture(dir, "targets/target.md", "# Target\n");
    await writeFixture(
      dir,
      "docs/source.md",
      "See [target](../targets/target.md).\n",
    );
    const r = await runScript(dir, ["docs/source.md"]);
    expect(r.code).toBe(0);
  });

  it("ignores anchor fragments — file existence is sufficient", async () => {
    const dir = join(tmp, "case-anchor");
    await writeFixture(dir, "target.md", "# Target\n\n## Some Section\n");
    await writeFixture(
      dir,
      "source.md",
      "See [the section](target.md#some-section) for details.\n",
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(0);
  });

  it("skips external links (https://, mailto:)", async () => {
    const dir = join(tmp, "case-external");
    await writeFixture(
      dir,
      "source.md",
      [
        "See [the spec](https://example.com/spec) for details.",
        "Or [email us](mailto:team@example.com).",
        "",
      ].join("\n"),
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(0);
  });

  it("ignores link-like strings inside inline code spans", async () => {
    const dir = join(tmp, "case-codespan");
    await writeFixture(
      dir,
      "source.md",
      "Use the `[text](does-not-exist.md)` pattern to write links.\n",
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(0);
  });

  it("ignores link-like strings inside fenced code blocks", async () => {
    const dir = join(tmp, "case-fence");
    await writeFixture(
      dir,
      "source.md",
      [
        "Example:",
        "",
        "```markdown",
        "[label](does-not-exist.md)",
        "```",
        "",
      ].join("\n"),
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(0);
  });

  it("fails on a reference-style usage with no matching definition", async () => {
    const dir = join(tmp, "case-undefined-ref");
    await writeFixture(
      dir,
      "source.md",
      "See [the target][missing-ref] for details.\n",
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("source.md");
    expect(r.stderr).toMatch(/missing-ref/);
  });

  it("fails when a reference-style definition points to a nonexistent file", async () => {
    const dir = join(tmp, "case-ref-broken");
    await writeFixture(
      dir,
      "source.md",
      [
        "See [the target][t].",
        "",
        "[t]: does-not-exist.md",
        "",
      ].join("\n"),
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("does-not-exist.md");
  });

  it("resolves a `.md` link to a `.template.md` file when only the templated version exists", async () => {
    // Package source convention: rendered output paths (`session-init.md`) are backed by
    // `session-init.template.md` in `packages/arc-framework/arc/`. The script must accept either
    // form so links written against the rendered paths still pass when checked in package source.
    const dir = join(tmp, "case-template-fallback");
    await writeFixture(dir, "target.template.md", "# Target template\n");
    await writeFixture(
      dir,
      "source.md",
      "See [the target](target.md) for details.\n",
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("still fails when neither plain nor `.template.md` form of the target exists", async () => {
    // Confirms the template fallback doesn't mask legitimately broken links — it only resolves
    // when a corresponding `.template.md` file actually exists.
    const dir = join(tmp, "case-template-fallback-broken");
    await writeFixture(
      dir,
      "source.md",
      "See [missing](nonexistent.md) for details.\n",
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("nonexistent.md");
  });

  it("skips source files matching `*.template.md` — post-install-relative links don't resolve at storage location", async () => {
    const dir = join(tmp, "case-template-suffix-skip");
    await writeFixture(
      dir,
      "agent.template.md",
      "See [briefing](AGENT-BRIEF.ARC.md) for details.\n",
    );
    const r = await runScript(dir, ["agent.template.md"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("skips source files matching `template-*.md` — same post-install-relative rationale", async () => {
    const dir = join(tmp, "case-template-prefix-skip");
    await writeFixture(
      dir,
      "template-agent.md",
      "See [briefing](AGENT-BRIEF.ARC.md) for details.\n",
    );
    const r = await runScript(dir, ["template-agent.md"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("skips files under `completed/` — archives document historical state, not current links", async () => {
    const dir = join(tmp, "case-completed-skip");
    await writeFixture(
      dir,
      "completed/old-plan.md",
      "See [the superseded doc](does-not-exist.md) for historical context.\n",
    );
    const r = await runScript(dir, ["completed/old-plan.md"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("emits diagnostics for multiple broken links in one run", async () => {
    const dir = join(tmp, "case-multi");
    await writeFixture(
      dir,
      "source.md",
      [
        "See [one](missing-one.md) and [two](missing-two.md).",
        "",
      ].join("\n"),
    );
    const r = await runScript(dir, ["source.md"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("missing-one.md");
    expect(r.stderr).toContain("missing-two.md");
  });

  it("refuses a relative link in a movable artifact even when its target exists", async () => {
    const dir = join(tmp, "case-movable-inline");
    await writeFixture(dir, ".arc/reference/guide.md", "# Guide\n");
    await writeFixture(dir, ".arc/active/meta-example.md", "See [the guide](../reference/guide.md).\n");
    const r = await runScript(dir, [".arc/active/meta-example.md"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(
      ".arc/active/meta-example.md: relative link in movable artifact -> ../reference/guide.md",
    );
  });

  it.each(["draft", "spec", "tasks", "notes", "cohort", "research", "analysis"])(
    "refuses a relative reference definition in a nested backlog %s artifact",
    async (kind) => {
      const dir = join(tmp, `case-movable-${kind}`);
      const source = `.arc/backlog/planned/group/item/${kind}-example.md`;
      await writeFixture(dir, ".arc/README.md", "# ARC\n");
      await writeFixture(dir, source, "See [the index][index].\n\n[index]: ../../../../README.md\n");
      const r = await runScript(dir, [source]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(`${source}: relative link in movable artifact -> ../../../../README.md`);
    },
  );

  it("allows external and in-file links in a movable artifact", async () => {
    const dir = join(tmp, "case-movable-allowed");
    await writeFixture(
      dir,
      ".arc/active/draft-example.md",
      "See [the docs](https://example.com) and [below](#below).\n\n## Below\n",
    );
    const r = await runScript(dir, [".arc/active/draft-example.md"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("leaves relative links alone outside the lifecycle directories", async () => {
    const dir = join(tmp, "case-movable-stable");
    await writeFixture(dir, ".arc/system/rules.md", "# Rules\n");
    await writeFixture(dir, ".arc/reference/guide.md", "See [the rules](../system/rules.md).\n");
    await writeFixture(dir, "docs/meta-overview.md", "See [the rules](../.arc/system/rules.md).\n");
    await writeFixture(dir, "docs/active/notes-release.md", "See [the rules](../../.arc/system/rules.md).\n");
    await writeFixture(dir, ".arc/backlog/ROADMAP.md", "See [the rules](../system/rules.md).\n");
    const r = await runScript(dir, [
      ".arc/reference/guide.md", "docs/meta-overview.md", "docs/active/notes-release.md", ".arc/backlog/ROADMAP.md",
    ]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });
});
