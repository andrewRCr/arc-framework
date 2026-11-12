/** Import refuses incomplete Git observations and can recover without losing source state. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { makeGitProcessError, type GitFailureEvidence } from "../helpers/git-exec-fake.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { ArchiveQuarterSchema, ArchiveSequenceSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { composePointerRecord } from "../../src/lib/work-unit/pointer-record.js";

const notesRef = "refs/notes/arc/user/alex";
const inbox = "# User Inbox\n\n## Work Unit\n\n### **Saved observation**\n\n- _Id:_ `12345678`\n\nSaved-only prose.\n";
const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
const failures: { label: string; evidence?: GitFailureEvidence & { isMaxBuffer?: true } }[] = [
  { label: "signaled exit one", evidence: { exitCode: 1, signal: "SIGTERM" } },
  { label: "canceled exit one", evidence: { exitCode: 1, isCanceled: true } },
  { label: "timed-out exit one", evidence: { exitCode: 1, timedOut: true } },
  { label: "output-limited exit one", evidence: { exitCode: 1, isMaxBuffer: true } },
  { label: "completed local Git failure", evidence: { exitCode: 128 } },
  { label: "untyped local failure" },
];
const branchFailures = failures.flatMap(failure => (["live", "parked"] as const).map(state => ({ ...failure, state })));

function observationFailure(args: readonly string[], evidence: GitFailureEvidence | undefined): Error {
  return evidence ? makeGitProcessError({ command: "git", args, ...evidence }) : new Error("Local import observation failed");
}

async function noLanding(h: Awaited<ReturnType<typeof importFixture>>) {
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
}

describe.each(["default", "separate"] as const)("incomplete import observations in %s", layout => {
  it.each(failures)("holds a $label notes-tip read, exposes saved-only state on recovery, then imports restored prose", async ({ evidence }) => {
    const h = await importFixture(layout);
    await h.git("git", ["notes", `--ref=${notesRef}`, "add", "-m", JSON.stringify({ version: 2, files: { "USER-INBOX.md": inbox } }), "HEAD"]);
    const tip = (await h.git("git", ["rev-parse", notesRef])).stdout;
    const exec = h.ports.exec;
    const failure = observationFailure(["--no-replace-objects", "rev-parse", "--verify", "--quiet", notesRef], evidence);
    let broken = true;
    h.ports.exec = async (command, args, options) => {
      if (broken && args.includes("rev-parse") && args.at(-1) === notesRef) {
        throw failure;
      }
      return exec(command, args, options);
    };
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining("Cannot read all alex's personal notes snapshot") }),
    ]) } });
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    await noLanding(h);
    expect((await h.git("git", ["rev-parse", notesRef])).stdout).toBe(tip);
    broken = false;
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { differingNotes: expect.arrayContaining([
      { person: "alex", path: "USER-INBOX.md", kind: "snapshot-only" },
    ]) } });
    expect(await h.migrate()).toMatchObject({ status: "refused" });
    await mkdir(join(h.root, ".arc/user/alex"), { recursive: true });
    await writeFile(join(h.root, ".arc/user/alex/USER-INBOX.md"), inbox);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore({ ...h.ports, identity: async () => SlugSchema.parse("alex") });
    expect(success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "alex" } }) })).content).toBe(inbox);
  }, 60_000);

  it.each(failures)("holds a $label archived branch tip and still refuses its surviving unlanded branch after recovery", async ({ evidence }) => {
    const h = await importFixture(layout, { completed: true });
    const path = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("archived"), placement: {
      kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3"), sequence: ArchiveSequenceSchema.parse("53"),
    } });
    await writeFile(join(h.root, path), makeMetaFixture("archived", { state: "Shipped", owner: "andrew", branch: "feat/archived",
      completed: "2026-10-01", prUrl: "https://example.test/pull/1" }));
    await h.git("git", ["add", ".arc"]);
    await h.git("git", ["commit", "-m", "Retain archived branch identity"]);
    await h.git("git", ["switch", "-c", "feat/archived"]);
    await writeFile(join(h.root, "unlanded.txt"), "Surviving archived work\n");
    await h.git("git", ["add", "unlanded.txt"]);
    await h.git("git", ["commit", "-m", "Retain unlanded code"]);
    await h.git("git", ["switch", "main"]);
    const exec = h.ports.exec;
    const failure = observationFailure(["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/heads/feat/archived"], evidence);
    let broken = true;
    h.ports.exec = async (command, args, options) => {
      if (broken && args.includes("rev-parse") && args.at(-1) === "refs/heads/feat/archived") {
        throw failure;
      }
      return exec(command, args, options);
    };
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining("Cannot prove archived branch 'feat/archived' landed") }),
    ]) } });
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    await noLanding(h);
    broken = false;
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringContaining("has not landed") }),
    ]) } });
    expect(await h.migrate()).toMatchObject({ status: "refused" });
    await h.git("git", ["merge", "--ff-only", "feat/archived"]);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
  }, 60_000);

  it.each(branchFailures)("propagates $label $state ancestry and uses the containing tip after recovery", async ({ evidence, state }) => {
    const h = await importFixture(layout);
    const older = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
    await h.git("git", ["switch", "feat/alpha"]);
    const content = "# Notes: Alpha\n\nNewer branch prose must survive.\n";
    await writeFile(join(h.root, ".arc/active/notes-alpha.md"), content);
    await h.git("git", ["add", ".arc"]);
    await h.git("git", ["commit", "-m", "Advance containing branch"]);
    const newer = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["switch", "main"]);
    // Local contains remote. The first ancestry answer is genuinely false; the second must run.
    await h.git("git", ["update-ref", "refs/remotes/origin/feat/alpha", older]);
    if (state === "parked") {
      await h.git("git", ["rm", "-r", ".arc/active"]);
      const pointer = join(h.root, ".arc/backlog/planned");
      await mkdir(pointer, { recursive: true });
      await writeFile(join(pointer, "meta-alpha.md"), composePointerRecord({ name: "alpha", branch: "feat/alpha", reason: "Wait for dependencies.", renderFields: { owner: "andrew" } }));
      await h.git("git", ["add", ".arc"]);
      await h.git("git", ["commit", "-m", "Park the work"]);
    }
    const exec = h.ports.exec;
    const failure = observationFailure(["--no-replace-objects", "merge-base", "--is-ancestor", older, newer], evidence);
    let broken = true;
    h.ports.exec = async (command, args, options) => {
      if (broken && args.includes("--is-ancestor") && args.at(-2) === older && args.at(-1) === newer) {
        throw failure;
      }
      return exec(command, args, options);
    };
    await expect(h.migrate()).rejects.toBe(failure);
    await noLanding(h);
    broken = false;
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    if (state === "parked") expect(success(await store.read({ reference: { ...reference, kind: "work-item/notes" } })).content).toBe(content);
    const branch = success(await store.read({ reference })).links?.branches?.[0];
    expect(branch?.ref).toBe("feat/alpha");
    expect(branch?.excluded.map(commit => commit.sha)).toContain(newer);
  }, 60_000);
});
