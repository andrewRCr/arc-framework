/** Clean and regenerated merges defer declared enforcement to the resulting head. */
import { afterEach, expect, inject, it } from "vitest";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHookManagerRepository, executionReceipt } from "../fixtures/checks/hook-manager.js";
import { cleanupTempDir, git, runArcNoTty } from "./helpers.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

it.each(["clean", "ROADMAP remedy"])("concludes a %s merge and enforces failing checks on the new head", async mode => {
  const root = await createHookManagerRepository("core.hooksPath", inject("arcHookManagerTools"));
  roots.push(root);
  const roadmap = join(root, ".arc/backlog/ROADMAP.md");
  await mkdir(join(root, ".arc/backlog"), { recursive: true });
  // Supply the hook's real link checker, which the current init recipe omits.
  await copyFile(new URL("../../arc/system/.internal/scripts/validate-links.sh", import.meta.url),
    join(root, ".arc/system/.internal/scripts/validate-links.sh"));
  await writeFile(roadmap, "# Roadmap\n\ncommon\n");
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: { content: {
    gate: "commit", cache: false, inputs: ["**"], command: [process.execPath, "-e",
      "require('node:fs').appendFileSync('receipt.json','executed\\n');process.exit(1)"],
  } } }));
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "shared inputs"]);
  const remote = join(root, ".git/test-origin");
  await git(root, ["init", "--bare", "--initial-branch=main", remote]);
  await git(root, ["remote", "add", "origin", remote]);
  await git(root, ["push", "origin", "HEAD:refs/heads/main"]);
  await git(root, ["switch", "-c", "incoming"]);
  await writeFile(mode === "clean" ? join(root, "src/0.txt") : roadmap, "incoming\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "incoming change"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["push", "origin", "HEAD:refs/heads/main"]);
  await git(root, ["switch", "feat/native-hooks"]);
  await writeFile(mode === "clean" ? join(root, "src/1.txt") : roadmap, "current\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "current change"]);
  const head = await git(root, ["rev-parse", "HEAD"]);
  const merged = await runArcNoTty(["base", "merge", "--expected-base", base, "--expected-head", head,
    ...(mode === "clean" ? [] : ["--regenerate-roadmap"])], root);
  expect(merged.exitCode, merged.stdout + merged.stderr).toBe(0);
  const result = JSON.parse(merged.stdout) as { actualHead: string };
  expect(result, merged.stdout).toMatchObject({ state: "merged", nextAction: "run-quality-gates" });
  expect((await git(root, ["rev-list", "--parents", "-n", "1", "HEAD"])).split(" "))
    .toEqual([result.actualHead, head, base]);
  expect(await git(root, ["status", "--porcelain=v1"])).toBe("");
  expect(await executionReceipt(root)).toBe("");
  if (mode !== "clean") expect(await readFile(roadmap, "utf8")).toContain("# Roadmap: Project Status");
  const checked = await runArcNoTty(["check", "new-head", "--from", head, "--json"], root);
  expect(checked.exitCode, checked.stdout + checked.stderr).toBe(1);
  expect(JSON.parse(checked.stdout).result.checks).toMatchObject([{ id: "content", kind: "enforcement", outcome: "failed" }]);
  expect(await executionReceipt(root)).toBe("executed\n");
}, 60_000);
