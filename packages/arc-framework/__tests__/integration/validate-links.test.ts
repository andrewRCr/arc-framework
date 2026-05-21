/**
 * Integration tests for validate-links.sh — pre-commit CHECK 13.
 *
 * The script validates markdown link targets in staged files. Tests exercise
 * it via subprocess against fixture markdown files in a temp directory.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
  ".arc/system/scripts/validate-links.sh",
);

async function runScript(
  cwd: string,
  args: string[],
): Promise<{ code: number; stderr: string; stdout: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(SCRIPT_PATH, args, { cwd });
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
});
