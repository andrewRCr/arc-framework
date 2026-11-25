/** The quiesce check retains every non-stale copy when proving import containment. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { readWindowDivergingCopyFindings } from "../../src/scripts/cutover-window/diverging-copies.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { createWindowImportContext } from "../../src/scripts/cutover-window/import-context.js";
import { readWindowLiveState } from "../../src/scripts/cutover-window/live-state.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

it("refuses a diverging non-stale copy and passes after both branches carry the work", async () => {
  const h = await windowFixture(), branch = "feat/copy", meta = ".arc/active/meta-alpha.md";
  await h.git("git", ["checkout", "-b", branch, "feat/alpha"]);
  await writeFile(join(h.root, meta), makeMetaFixture("alpha", { owner: "andrew", branch }));
  await writeFile(join(h.root, "copy.txt"), "Work only the other copy carries.\n");
  await h.git("git", ["add", "."]); await h.git("git", ["commit", "-m", "Advance the other live copy"]);
  await h.git("git", ["push", "--set-upstream", "origin", branch]);
  await h.git("git", ["checkout", "feat/alpha"]);
  await writeFile(join(h.root, "alpha.txt"), "Independent work on the first copy.\n");
  await h.git("git", ["add", "."]); await h.git("git", ["commit", "-m", "Advance the first copy"]);
  await h.git("git", ["push", "origin", "feat/alpha"]); await h.git("git", ["checkout", "main"]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "alpha", condition: expect.stringContaining("not an ancestor"),
      remedy: expect.stringContaining("selected") }),
  ]) } });
  expect(refused.report).toContain("feat/alpha"); expect(refused.report).toContain(branch);
  await h.git("git", ["checkout", "feat/alpha"]); await h.git("git", ["merge", "--no-commit", branch]);
  await writeFile(join(h.root, meta), makeMetaFixture("alpha", { owner: "andrew", branch: "feat/alpha" }));
  await h.git("git", ["add", meta]); await h.git("git", ["commit", "-m", "Carry the other copy's work"]);
  await h.git("git", ["push", "origin", "feat/alpha"]);
  await h.git("git", ["checkout", branch]); await h.git("git", ["merge", "--no-commit", "feat/alpha"]);
  await writeFile(join(h.root, meta), makeMetaFixture("alpha", { owner: "andrew", branch }));
  await h.git("git", ["add", meta]); await h.git("git", ["commit", "-m", "Carry the combined work on both copies"]);
  await h.git("git", ["push", "origin", branch]); await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses local and fetched tips that both moved without a shadow warning and passes after their merge", async () => {
  const h = await windowFixture();
  const base = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  const tree = (await h.git("git", ["rev-parse", `${base}^{tree}`])).stdout.trim();
  const local = (await h.ports.execInput(["commit-tree", tree, "-p", base], "Local-only advancement\n")).trim();
  const remote = (await h.ports.execInput(["commit-tree", tree, "-p", base], "Remote-only advancement\n")).trim();
  await h.git("git", ["update-ref", "refs/heads/feat/alpha", local, base]);
  await h.git("git", ["push", "origin", `${remote}:refs/heads/feat/alpha`]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "alpha", condition: expect.stringContaining("not an ancestor") }),
  ]) } });
  expect(refused.report).toContain("feat/alpha"); expect(refused.report).toContain("origin/feat/alpha");
  const acquired = await readWindowLiveState(await createWindowImportContext(h.root), [], {
    local: { "feat/alpha": local }, origin: { "feat/alpha": remote },
  });
  expect(acquired.composition.qualityFacts.warnings.filter(warning => warning.code === "candidate-shadowed"
    && warning.workUnit === "alpha")).toEqual([]);
  await h.git("git", ["checkout", "feat/alpha"]); await h.git("git", ["merge", "--no-edit", "origin/feat/alpha"]);
  await h.git("git", ["push", "origin", "feat/alpha"]); await h.git("git", ["checkout", "main"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("preserves an actionable refusal when copy ancestry is unreadable and passes after repair", async () => {
  const h = await windowFixture();
  const check = async (unreadable: boolean) => {
    const stdout: string[] = [], stderr: string[] = [];
    const exit = await runWindow(["check", "--repo", h.root, "--json"], { check: async ({ repo }) => {
      const context = await createWindowImportContext(repo);
      const { composition } = await readWindowLiveState(context, [], { local: {}, origin: {} });
      const main = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
      const exec: typeof context.exec = (command, args, options) => unreadable && args.includes("--is-ancestor")
        ? Promise.reject(new Error("Copy ancestry interrupted")) : context.exec(command, args, options);
      const findings = await readWindowDivergingCopyFindings({ ...context, exec }, main, composition);
      return { operation: "check", status: findings.length ? "refused" : "passed", findings };
    } }, { stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); } });
    return { exit, result: JSON.parse(stdout.join("")) as unknown, report: stderr.join("") };
  };
  const refused = await check(true);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("Copy ancestry interrupted"),
      remedy: expect.stringContaining("readable commits") }),
  ]) } });
  expect(await check(false)).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);
