/** Import inventories retain the complete code-tip observations acquired before landing. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { makeGitProcessError, type GitFailureEvidence } from "../helpers/git-exec-fake.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { readRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { computeCopyKeys } from "../../src/lib/git/copy-key.js";

const baseRef = "refs/remotes/origin/main";
const metaReference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
type Fixture = Awaited<ReturnType<typeof importFixture>>;
const incomplete = [
  { label: "signaled", evidence: { exitCode: 1, signal: "SIGTERM" } },
  { label: "canceled", evidence: { exitCode: 1, isCanceled: true } },
  { label: "timed-out", evidence: { exitCode: 1, timedOut: true } },
  { label: "output-limited", evidence: { exitCode: 1, isMaxBuffer: true } },
] satisfies { label: string; evidence: GitFailureEvidence & { isMaxBuffer?: true } }[];
const requiredFailures: { label: string; stage: "raw" | "pinned"; evidence?: GitFailureEvidence & { isMaxBuffer?: true } }[] = [
  { ...incomplete[0]!, stage: "raw" },
  { ...incomplete[1]!, stage: "raw" },
  { ...incomplete[2]!, stage: "pinned" },
  { ...incomplete[3]!, stage: "raw" },
  { label: "completed fatal", stage: "pinned", evidence: { exitCode: 128 } },
  { label: "untyped", stage: "pinned" },
];

/** Main A, tracking main B and work C are distinct real commits with no task footers. */
async function twoBaseGraph(layout: "default" | "separate") {
  const h = await importFixture(layout);
  const a = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  await h.git("git", ["switch", "feat/alpha"]);
  const commit = async (name: string) => {
    await writeFile(join(h.root, `${name}.txt`), `${name} code\n`);
    await h.git("git", ["add", `${name}.txt`]);
    await h.git("git", ["commit", "-m", `Add ${name} code`]);
    return (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  };
  const b = await commit("base-b"), c = await commit("work-c");
  await h.git("git", ["switch", "main"]);
  await h.git("git", ["update-ref", baseRef, b]);
  // Keep the observed object explicitly reachable even if its named base is removed.
  await h.git("git", ["update-ref", "refs/heads/held-import-base", b]);
  return { ...h, a, b, c };
}

async function expectExclusions(h: Fixture, shas: string[]) {
  const store = createRefStore(h.ports);
  const identity = success(await store.read({ reference: RecordReferenceSchema.parse({
    kind: "project-registry/identity", owner: { type: "project", name: "project" },
  }) }));
  const parsed: unknown = JSON.parse(identity.content);
  if (typeof parsed !== "object" || parsed === null || !("projectId" in parsed) || typeof parsed.projectId !== "string") {
    throw new Error("Imported project identity is missing");
  }
  const meta = success(await store.read({ reference: metaReference }));
  expect(meta.links?.branches).toHaveLength(1);
  expect(meta.links?.branches?.[0]).toMatchObject({ repository: parsed.projectId, ref: "feat/alpha", linkedAs: "created" });
  const excluded = meta.links?.branches?.[0]?.excluded;
  expect(excluded?.map(commit => commit.sha)).toEqual(shas);
  for (const capture of excluded ?? []) expect(capture).toMatchObject({ repository: parsed.projectId, copyKey: expect.stringMatching(/^v1:/u) });
}

async function sourceSnapshot(h: Fixture) {
  return {
    refs: (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout,
    files: await Promise.all([".arc/active/meta-alpha.md", ".arc/active/notes-alpha.md", resolveArcPath({ kind: "inbox", scope: { kind: "project" } })]
      .map(path => readFile(join(h.root, path), "utf8"))),
  };
}

async function expectUnlanded(h: Fixture, before: Awaited<ReturnType<typeof sourceSnapshot>>) {
  expect(await sourceSnapshot(h)).toEqual(before);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(await readRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root))).toBeNull();
}

describe.each(["default", "separate"] as const)("captured import bases in %s", layout => {
  it("omits a copy-equivalent captured base commit while preserving other qualified exclusions", async () => {
    const h = await importFixture(layout);
    const tasks = join(h.root, ".arc/active/tasks-alpha.md");
    await writeFile(tasks, (await readFile(tasks, "utf8")).replace("`[ ]`", "`[x]`"));
    await h.git("git", ["add", tasks]);
    await h.git("git", ["commit", "-m", "Close task markers"]);
    await h.git("git", ["branch", "-f", "feat/alpha", "HEAD"]);
    await h.git("git", ["switch", "feat/alpha"]);
    await writeFile(join(h.root, "copied.txt"), "Copied code\n");
    await h.git("git", ["add", "copied.txt"]);
    await h.git("git", ["commit", "-m", "Original code without attribution"]);
    const original = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["switch", "-c", "captured-base"]);
    // Real amend preserves the author bytes and patch but changes the object and task attribution.
    await h.git("git", ["commit", "--amend", "-m", "Captured copy\n\nContext: tasks-alpha.md (Task 1.1)"]);
    const captured = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["update-ref", baseRef, captured]);
    await h.git("git", ["switch", "feat/alpha"]);
    await writeFile(join(h.root, "remaining.txt"), "Remaining code\n");
    await h.git("git", ["add", "remaining.txt"]);
    await h.git("git", ["commit", "-m", "Retain uncaptured work"]);
    const remaining = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["switch", "main"]);
    const keys = await computeCopyKeys({ cwd: h.root, commits: [original, captured], execRaw: h.ports.rawExec });
    expect(original).not.toBe(captured);
    expect(keys.get(original)?.copyKey).toMatch(/^v1:/u);
    expect(keys.get(original)?.copyKey).toBe(keys.get(captured)?.copyKey);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    await expectExclusions(h, [remaining]);
    const meta = success(await createRefStore(h.ports).read({ reference: metaReference }));
    expect(meta.links?.taskCaptures?.["1.1"]?.map(commit => commit.sha)).toEqual([captured]);
  }, 60_000);

  it.each(incomplete)("persists C alone despite a $label obsolete named-B observation", async ({ evidence }) => {
    const h = await twoBaseGraph(layout), exec = h.ports.exec;
    h.ports.exec = async (command, args, options) => {
      // Strict acquisition uses the raw ref and pinned OID. Only the inherited reread is incomplete.
      // The repaired importer need not execute this obsolete operation at all.
      if (args.includes("rev-parse") && args.at(-1) === `${baseRef}^{commit}`) {
        throw makeGitProcessError({ command, args, ...evidence });
      }
      return exec(command, args, options);
    };
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    await expectExclusions(h, [h.c]);
  }, 60_000);

  it.each(["move", "delete"] as const)("keeps captured B when its named base is changed by %s after strict acquisition", async change => {
    const h = await twoBaseGraph(layout), exec = h.ports.exec;
    let changed = false;
    h.ports.exec = async (command, args, options) => {
      const result = await exec(command, args, options);
      if (!changed && args.includes("rev-parse") && args.at(-1) === `${h.b}^{commit}`) {
        changed = true;
        await h.git("git", change === "move" ? ["update-ref", baseRef, h.a] : ["update-ref", "-d", baseRef]);
      }
      return result;
    };
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    expect((await h.git("git", ["rev-parse", "refs/heads/held-import-base"])).stdout.trim()).toBe(h.b);
    await expectExclusions(h, [h.c]);
  }, 60_000);

  it.each(requiredFailures)("propagates a $label required $stage base observation, preserves source, then retries", async ({ stage, evidence }) => {
    const h = await twoBaseGraph(layout), before = await sourceSnapshot(h), exec = h.ports.exec;
    const operand = stage === "raw" ? baseRef : `${h.b}^{commit}`;
    const args = ["--no-replace-objects", "rev-parse", "--verify", "--quiet", operand];
    const failure = evidence ? makeGitProcessError({ command: "git", args, ...evidence }) : new Error("Required base observation failed");
    let broken = true;
    h.ports.exec = async (command, invocation, options) => {
      if (broken && invocation.includes("rev-parse") && invocation.at(-1) === operand) throw failure;
      return exec(command, invocation, options);
    };
    await expect(h.migrate()).rejects.toBe(failure);
    await expectUnlanded(h, before);
    broken = false;
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    await expectExclusions(h, [h.c]);
  }, 60_000);

  it("propagates failure of the real pinned exclusion walk without landing, then retries", async () => {
    const h = await twoBaseGraph(layout), before = await sourceSnapshot(h), exec = h.ports.exec;
    const args = ["--no-replace-objects", "rev-list", "--no-merges", h.c, "--not", h.a, h.b];
    const failure = makeGitProcessError({ command: "git", args, exitCode: 128 });
    let broken = true;
    h.ports.exec = async (command, invocation, options) => {
      if (broken && invocation.includes("rev-list") && invocation.includes("--no-merges")
        && invocation.includes(h.c) && invocation.includes("--not") && invocation.includes(h.a) && invocation.includes(h.b)) throw failure;
      return exec(command, invocation, options);
    };
    await expect(h.migrate()).rejects.toBe(failure);
    await expectUnlanded(h, before);
    broken = false;
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    await expectExclusions(h, [h.c]);
  }, 60_000);

  it.each([false, true])("blocks genuinely absent bases even when one reappears after capture (%s), then retries", async reappear => {
    const h = await twoBaseGraph(layout);
    await h.git("git", ["switch", "--detach"]);
    await h.git("git", ["branch", "-D", "main"]);
    await h.git("git", ["update-ref", "-d", baseRef]);
    const sourceFiles = (await sourceSnapshot(h)).files, exec = h.ports.exec;
    let restoreAfterCapture = reappear;
    h.ports.exec = async (command, args, options) => {
      // Branch reads start only after both strict base probes have observed genuine absence.
      if (restoreAfterCapture && args.includes("rev-parse") && args.at(-1) === "refs/heads/feat/alpha") {
        restoreAfterCapture = false;
        await h.git("git", ["update-ref", baseRef, h.b]);
      }
      return exec(command, args, options);
    };
    const trial = await h.migrate(true);
    expect(trial).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringMatching(/base/iu), remedy: { text: expect.any(String) } }),
    ]) } });
    // Recreate the same absent initial observation for the real attempt.
    await h.git("git", ["update-ref", "-d", baseRef]);
    restoreAfterCapture = reappear;
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    expect((await sourceSnapshot(h)).files).toEqual(sourceFiles);
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    expect(await readRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root))).toBeNull();
    await h.git("git", ["update-ref", baseRef, h.b]);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    await expectExclusions(h, [h.c]);
  }, 60_000);
});
