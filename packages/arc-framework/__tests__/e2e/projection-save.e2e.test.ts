/** The installed CLI keeps the global bypass distinct from unsupported projection save. */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";
import { useInRepoStore } from "../helpers/in-repo-store-override.js";
import { projectionSaveStep } from "../../src/lib/store/pre-flip-steps.js";
import { lifecycleRepository, LIFECYCLE_TIMEOUT_MS } from "../helpers/store-lifecycle-fixture.js";

it.each([{ args: [] }, { args: ["--resolve", "personal/person/andrew/one"] }])("refuses unsupported projection save with $args as whole JSON", async ({ args }) => {
  useInRepoStore();
  const checkout = await createTempRepo("arc-projection-save-");
  try {
    await mkdir(join(checkout, ".arc"));
    await mkdir(join(checkout, ".git", "arc-projection"));
    const index = join(checkout, ".git", "arc-projection", "index");
    await writeFile(index, "unreadable projection index");
    const result = await runArc(["save", ...args, "--json"], checkout);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", refusal: { code: "unsupported",
      remedy: { text: projectionSaveStep() } } });
    expect(JSON.parse(result.stdout).refusal.remedy).not.toHaveProperty("argv");
    expect(await readFile(index, "utf8")).toBe("unreadable projection index");
    expect((await runArc(["--help"], checkout)).stdout).toMatch(/^\s+save\s+/mu);
    expect((await runArc(["save", "--help"], checkout)).stdout).toContain("--resolve <conflict>");
  } finally { await cleanupTempDir(checkout); }
});

it("continues through the in-repo save remedy when planning workflows confirm a save", async () => {
  useInRepoStore();
  const h = await lifecycleRepository();
  const config = ".arc/system/arc-config.yml";
  const edit = "# Save this tracked edit with the in-repo store.";
  await appendFile(join(h.repo, config), `\n${edit}\n`);
  const save = await h.run(["save", "--json"]);
  expect(save.exitCode, save.output).toBe(1);
  expect(JSON.parse(save.stdout)).toMatchObject({ status: "refused", refusal: { code: "unsupported",
    condition: expect.stringContaining("storage backend"), remedy: { text: expect.stringContaining("git commit") } } });

  const workflows = [
    { file: "create-spec.md", confirmations: 2 },
    { file: "generate-tasks.md", confirmations: 1 },
    { file: "work-unit-lifecycle/activate-work-unit.md", confirmations: 1 },
  ];
  const missing = [];
  for (const { file, confirmations } of workflows) {
    const workflow = await readFile(join(h.repo, ".arc/system/workflows/arc", file), "utf8");
    const withRemedy = workflow.match(/arc save`\s+refuses,[^.]*\bremedy\b[^.]*\bcontinue\b/giu) ?? [];
    if (withRemedy.length !== confirmations) missing.push(file);
  }
  expect(missing, "Workflows must allow the reported in-repo remedy to satisfy the save gate").toEqual([]);
  await git(h.repo, ["add", "--", config]);
  await git(h.repo, ["commit", "-m", "Save tracked ARC edit"]);
  expect(await git(h.repo, ["show", `HEAD:${config}`])).toContain(edit);
  const status = await h.run(["status", "--json"]);
  expect(JSON.parse(status.stdout)).toMatchObject({ projection: { ok: true, value: { kind: "disabled" } } });
}, LIFECYCLE_TIMEOUT_MS);

describe.each(["ref", "in-repo"] as const)("projection bypass with the %s backend", (backend) => {
  it.each([{ args: ["save", "--skip-projection", "--json"] }, { args: ["--skip-projection", "save", "--json"] }])(
    "reports the global bypass for $args", async ({ args }) => {
      if (backend === "in-repo") useInRepoStore();
      const checkout = await createTempRepo("arc-projection-skip-save-");
      try {
        await mkdir(join(checkout, ".arc"));
        await mkdir(join(checkout, ".git", "arc-projection"));
        const path = join(checkout, ".git", "arc-projection", "index");
        await writeFile(path, "unreadable projection index");
        const result = await runArc(args, checkout);
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", refusal: { code: "projection-skipped",
          condition: expect.stringContaining("--skip-projection"),
          remedy: { text: expect.stringContaining("without --skip-projection") } } });
        expect(await readFile(path, "utf8")).toBe("unreadable projection index");
        if (backend === "in-repo") {
          const unskipped = await runArc(args.filter(arg => arg !== "--skip-projection"), checkout);
          expect(unskipped.exitCode).toBe(1);
          expect(JSON.parse(unskipped.stdout)).toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
        }
      } finally { await cleanupTempDir(checkout); }
    },
  );
});

it.each([{ args: ["--skip-projection", "config", "status", "--json"] },
  { args: ["config", "status", "--skip-projection", "--json"] }])(
  "inherits the global bypass through nested commands for $args", async ({ args }) => {
    const checkout = await createTempRepo("arc-projection-skip-global-");
    try {
      await mkdir(join(checkout, ".arc", "system"), { recursive: true });
      await writeFile(join(checkout, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
      const ordinary = await runArc(["config", "status", "--json"], checkout);
      expect(ordinary.exitCode).toBe(0);
      const skipped = await runArc(args, checkout);
      expect(skipped.exitCode).toBe(0);
      expect(JSON.parse(skipped.stdout)).toEqual(JSON.parse(ordinary.stdout));
      expect((await runArc(["config", "status", "--help"], checkout)).stdout).toContain("--skip-projection");
    } finally { await cleanupTempDir(checkout); }
  },
);
