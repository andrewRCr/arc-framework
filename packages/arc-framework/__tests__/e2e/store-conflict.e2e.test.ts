/** Hidden conflict remedies through the packaged CLI and captured native Git history. */
import { expect, it, onTestFinished } from "vitest";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

interface CapturedConflict {
  notice: { remedy: { argv: string[] } };
  reference: { kind: string; key: string; owner: { uid: string; name: string } };
  conflict: unknown;
  history: string;
  exported: string;
}

async function fixture(layout: "default" | "separate") {
  const cwd = await createTempRepo("arc-store-conflict-");
  onTestFinished(() => cleanupTempDir(cwd));
  const captured: CapturedConflict = JSON.parse(await readFile(join(import.meta.dirname, "../fixtures/store/retained-conflict.json"), "utf8"));
  const directory = join(cwd, ".git", "arc", "store");
  if (layout === "separate") await git(cwd, ["init", "--bare", "--ref-format=reftable", directory]);
  const gitArgs = layout === "separate" ? [`--git-dir=${directory}`] : [];
  execFileSync("git", [...gitArgs, "fast-import", "--quiet"], { cwd, input: captured.exported });
  return { cwd, captured, gitArgs, argv: captured.notice.remedy.argv.slice(1) };
}

it.each(["default", "separate"] as const)("executes the exact inspection and explicit discard remedy in the %s layout", async (layout) => {
  const { cwd, captured, gitArgs, argv } = await fixture(layout);
  const registry = await git(cwd, [...gitArgs, "rev-parse", "refs/arc/project/registry"]);
  const inspected = await runArcNoTty([...argv, "--json"], cwd);
  expect(inspected.exitCode, JSON.stringify(inspected)).toBe(0);
  expect(JSON.parse(inspected.stdout)).toMatchObject({ status: "ok", result: {
    status: "present", reference: captured.reference, version: expect.any(String), conflict: captured.conflict,
  } });
  const human = await runArcNoTty(argv, cwd);
  expect(human.exitCode).toBe(0);
  expect(human.stdout).toContain("Preserved late alternative.");
  expect(human.stdout).toContain('"current"');
  expect(human.stdout).toContain('"incoming"');
  const discarded = await runArcNoTty([...argv, "--discard", "--json"], cwd);
  expect(discarded.exitCode, JSON.stringify(discarded)).toBe(0);
  expect(JSON.parse(discarded.stdout)).toEqual({ status: "ok", result: { status: "discarded", reference: captured.reference } });
  for (const flags of [["--json"], ["--discard", "--json"]]) {
    const absent = await runArcNoTty([...argv, ...flags], cwd);
    expect(absent.exitCode).toBe(0);
    expect(JSON.parse(absent.stdout)).toMatchObject({ status: "ok", result: { status: "absent" } });
  }
  expect(await git(cwd, [...gitArgs, "rev-parse", "refs/arc/project/registry"])).toBe(registry);
  expect(await git(cwd, [...gitArgs, "for-each-ref", "--format=%(refname)", `refs/arc/work/${captured.reference.owner.uid}`])).toBe("");
  expect(await git(cwd, [...gitArgs, "ls-tree", "-r", "--name-only", captured.history])).not.toContain(`conflicts/${captured.reference.key}.json`);
}, 60_000);

it("rejects non-work-item conflict kinds and keeps the namespace hidden from ordinary help", async () => {
  const { cwd, captured } = await fixture("default");
  const invalid = await runArcNoTty(["store", "conflict", captured.reference.owner.uid, "personal/conflict-record", "id", "--json"], cwd);
  expect(invalid.exitCode).toBe(1);
  expect(invalid.stdout, JSON.stringify(invalid)).toContain('"unsupported"');
  expect(JSON.parse(invalid.stdout)).toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
  expect((await runArcNoTty(["--help"], cwd)).stdout).not.toMatch(/^\s+store(?:\s|$)/mu);
  expect((await runArcNoTty(["store", "--help"], cwd)).stdout).toContain("conflict");
  expect((await runArcNoTty(["store", "conflict", "--help"], cwd)).stdout).toContain("--discard");
}, 60_000);
