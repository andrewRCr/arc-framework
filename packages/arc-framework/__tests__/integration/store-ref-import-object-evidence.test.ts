/** Held code and notes identities require readable commit evidence before import can omit anything. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { ArchiveQuarterSchema, ArchiveSequenceSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { composePointerRecord } from "../../src/lib/work-unit/pointer-record.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { success } from "../helpers/store/suite-tools.js";

type Fixture = Awaited<ReturnType<typeof importFixture>>;
async function noLanding(h: Fixture) {
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
}

async function park(h: Fixture) {
  const path = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("alpha"),
    placement: { kind: "backlog", commitment: "planned", cohort: [] } });
  await h.git("git", ["rm", "-r", ".arc/active"]);
  await mkdir(dirname(join(h.root, path)), { recursive: true });
  await writeFile(join(h.root, path), composePointerRecord({ name: "alpha", branch: "feat/alpha", reason: "Wait for dependencies.", renderFields: { owner: "andrew" } }));
  await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Park the held branch"]);
}

describe.each(["default", "separate"] as const)("complete import object evidence in %s", layout => {
  it.each(["local", "origin"] as const)("holds an archived %s branch when required commit evidence becomes unavailable after inventory, then retries", async location => {
    const h = await importFixture(layout, { completed: true });
    const path = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("archived"), placement: {
      kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3"), sequence: ArchiveSequenceSchema.parse("53"),
    } });
    await writeFile(join(h.root, path), makeMetaFixture("archived", { state: "Shipped", owner: "andrew", branch: "feat/archived",
      completed: "2026-10-01", prUrl: "https://example.test/pull/1" }));
    await h.git("git", ["add", ".arc"]);
    await h.git("git", ["commit", "-m", "Retain archived branch identity"]);
    await h.git("git", ["switch", "-c", "feat/archived"]);
    await writeFile(join(h.root, "held-code.txt"), "Held unlanded archived code.\n");
    await h.git("git", ["add", "held-code.txt"]);
    await h.git("git", ["commit", "-m", "Retain held code"]);
    const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["switch", "main"]);
    const ref = location === "local" ? "refs/heads/feat/archived" : "refs/remotes/origin/feat/archived";
    if (location === "origin") {
      await h.git("git", ["update-ref", ref, tip]);
      await h.git("git", ["branch", "-D", "feat/archived"]);
    }
    const exec = h.ports.exec;
    let broken = true;
    h.ports.exec = async (command, args, options) => {
      // Native Git gives the same exit 1 for this unavailable held object and an absent ref.
      if (broken && args.includes("rev-parse") && [`${ref}^{commit}`, `${tip}^{commit}`].includes(args.at(-1) ?? "")) {
        throw makeGitProcessError({ command, args, exitCode: 1 });
      }
      return exec(command, args, options);
    };
    expect((await h.git("git", ["rev-parse", "--verify", "--quiet", ref])).stdout.trim()).toBe(tip);
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining("Cannot prove archived branch 'feat/archived' landed") }),
    ]) } });
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    await noLanding(h);
    broken = false;
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining("has not landed") }),
    ]) } });
    await h.git("git", ["merge", "--ff-only", ref]);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  }, 60_000);

  it.each([
    { location: "local", stage: "raw", output: "", state: "live" },
    { location: "origin", stage: "raw", output: "not-an-object\n", state: "live" },
    { location: "origin", stage: "commit", output: "", state: "live" },
    { location: "base", stage: "commit", output: "not-an-object\n", state: "live" },
  ])("refuses $state $location $stage successful output $output and retries with complete evidence", async ({ location, stage, output }) => {
    const h = await importFixture(layout);
    const tip = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
    const ref = location === "base" ? "refs/heads/main" : location === "origin" ? "refs/remotes/origin/feat/alpha" : "refs/heads/feat/alpha";
    if (location === "origin") {
      await h.git("git", ["update-ref", ref, tip]);
      await h.git("git", ["branch", "-D", "feat/alpha"]);
    }
    let broken = true;
    const exec = h.ports.exec;
    h.ports.exec = async (command, args, options) => {
      const operand = args.at(-1);
      if (broken && args.includes("rev-parse") && (operand === `${ref}^{commit}`
        || operand === (stage === "raw" ? ref : `${tip}^{commit}`))) return { stdout: output };
      return exec(command, args, options);
    };
    await expect(h.migrate()).rejects.toThrow(/object identity/u);
    await noLanding(h);
    broken = false;
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect(success(await createRefStore(h.ports).read({ reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }) })).links?.branches?.[0]?.ref).toBe("feat/alpha");
  }, 60_000);

  it.each(["base", "parked"] as const)("preserves a completed failed required-commit read for a held %s ref and retries", async location => {
    const h = await importFixture(layout);
    const ref = location === "base" ? "refs/heads/main" : "refs/heads/feat/alpha";
    const tip = (await h.git("git", ["rev-parse", ref])).stdout.trim();
    if (location === "parked") await park(h);
    const failure = makeGitProcessError({ command: "git", args: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", `${tip}^{commit}`], exitCode: 1 });
    let broken = true;
    const exec = h.ports.exec;
    h.ports.exec = async (command, args, options) => {
      if (broken && args.includes("rev-parse") && [ `${ref}^{commit}`, `${tip}^{commit}` ].includes(args.at(-1) ?? "")) throw failure;
      return exec(command, args, options);
    };
    await expect(h.migrate()).rejects.toBe(failure);
    await noLanding(h);
    broken = false;
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  }, 60_000);

  it("refuses a real noncommit origin branch and imports after restoring its held commit", async () => {
    const h = await importFixture(layout);
    const ref = "refs/remotes/origin/feat/alpha", tip = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
    const blob = (await h.ports.execInput(["hash-object", "-w", "--stdin"], "This is not code history.\n", { cwd: h.root })).trim();
    await h.git("git", ["update-ref", ref, blob]);
    await h.git("git", ["branch", "-D", "feat/alpha"]);
    await expect(h.migrate()).rejects.toMatchObject({ kind: "nonzero-exit", exitCode: 1 });
    await noLanding(h);
    await h.git("git", ["update-ref", ref, tip]);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  }, 60_000);

  it.each(["failed", "empty", "malformed"] as const)("requires %s notes commit acquisition before reading a held identity", async defect => {
    const h = await importFixture(layout), ref = "refs/notes/arc/user/alex";
    await h.git("git", ["notes", `--ref=${ref}`, "add", "-m", '{"version":2,"files":{}}', "HEAD"]);
    const tip = (await h.git("git", ["rev-parse", ref])).stdout.trim();
    const exec = h.ports.exec;
    let broken = true;
    h.ports.exec = async (command, args, options) => {
      if (broken && args.includes("rev-parse") && args.at(-1) === `${tip}^{commit}`) {
        if (defect === "failed") throw makeGitProcessError({ command, args, exitCode: 1 });
        return { stdout: defect === "empty" ? "" : "not-an-object\n" };
      }
      return exec(command, args, options);
    };
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining("Cannot read all alex's personal notes snapshot") }),
    ]) } });
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    await noLanding(h);
    expect((await h.git("git", ["rev-parse", ref])).stdout.trim()).toBe(tip);
    broken = false;
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  }, 60_000);
});
