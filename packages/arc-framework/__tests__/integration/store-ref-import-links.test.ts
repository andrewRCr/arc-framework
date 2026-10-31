/** Imported branch and task links resolve through independently acquired code histories. */
import { describe, expect, it } from "vitest";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";
import { success } from "../helpers/store/suite-tools.js";
import { createStore, createRefStore, RecordReferenceSchema, type Store } from "../../src/lib/store/index.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { computeCopyKeys } from "../../src/lib/git/copy-key.js";
import { importFixture, IMPORT_INBOX } from "../helpers/store/import-fixture.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { ArchiveQuarterSchema, ArchiveSequenceSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { LineageRecordSchema, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { setMetaBranch, setMetaState } from "../../src/lib/active/meta-reader.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { hashBlob, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";

async function projectId(store: Store): Promise<string> {
  const record = success(await store.read({ reference: RecordReferenceSchema.parse({
    kind: "project-registry/identity", owner: { type: "project", name: "project" },
  }) }));
  const parsed: unknown = JSON.parse(record.content);
  if (typeof parsed !== "object" || parsed === null || !("projectId" in parsed) || typeof parsed.projectId !== "string") {
    throw new Error("Imported project identity is missing");
  }
  return parsed.projectId;
}

it("links every admitted Errand branch prefix as created with the same source lookup", async () => {
  const prefixes = ["fix", "chore", "refactor", "hotfix"] as const;
  const h = await importComparisonFixture("default", async fixture => {
    const io = { exec: fixture.ports.exec, execInput: fixture.ports.execInput, identity: "andrew" };
    const entries = new Map<string, string>();
    for (const [index, prefix] of prefixes.entries()) {
      const slug = `${prefix}-example`, branch = `${prefix}/${slug}`;
      await fixture.git("git", ["switch", "-c", branch]);
      await writeFile(join(fixture.root, "errand.txt"), `${prefix} Errand code\n`);
      await fixture.git("git", ["add", "errand.txt"]);
      await fixture.git("git", ["commit", "-m", `Change the ${prefix} example`]);
      await fixture.git("git", ["switch", "main"]);
      const timestamp = "2026-01-01T00:00:00.000Z";
      const record = TransientIdentityRecordSchema.parse({ version: 3, claimId: String(index + 1).repeat(32), createdAt: timestamp,
        updatedAt: timestamp, kind: "errand", purpose: "errand", slug, branch,
        intent: "Change the example", origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null });
      entries.set(slug, await hashBlob(io.execInput, serializeTransientIdentityRecord(record)));
    }
    await writeTreeCommit(io, entries, "Seed transient identities", [], null);
  });
  const source = createStore(createDefaultStorePorts({ checkoutRoot: h.source.root }));
  expect(await h.target.migrate()).toMatchObject({ status: "ok" });
  const repository = await projectId(h.store);
  for (const prefix of prefixes) {
    const slug = `${prefix}-example`, ref = `${prefix}/${slug}`;
    const beforeResult = await source.lookup({ kind: "ref", repository: h.source.root, ref });
    const afterResult = await h.store.lookup({ kind: "ref", repository, ref });
    expect.soft(beforeResult.status, ref).toBe("ok");
    expect.soft(afterResult.status, ref).toBe("ok");
    if (beforeResult.status !== "ok" || afterResult.status !== "ok") continue;
    const before = beforeResult.result, after = afterResult.result;
    expect(before.reference.kind).toBe("work-item/record");
    expect(before.reference.owner.name).toBe(slug);
    expect(after.reference.kind).toBe(before.reference.kind);
    expect(after.reference.owner.name).toBe(before.reference.owner.name);
    const record = success(await h.store.read({ reference: after.reference }));
    expect.soft(record.links?.branches, ref).toEqual([{ repository, ref, linkedAs: "created", excluded: [] }]);
  }
}, 30_000);

it.each(["merge", "missing-author", "unreadable-patch"] as const)("omits a %s footer commit from task captures", async problem => {
  const h = await importFixture();
  const tasks = join(h.root, ".arc/active/tasks-alpha.md");
  await writeFile(tasks, (await readFile(tasks, "utf8")).replace("`[ ]`", "`[x]`"));
  await h.git("git", ["add", tasks]);
  await h.git("git", ["commit", "-m", "Close the example task"]);
  const base = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["update-ref", "refs/heads/feat/alpha", base]);
  await h.git("git", ["switch", "feat/alpha"]);
  await writeFile(join(h.root, "code.txt"), "Nonempty code patch\n");
  await h.git("git", ["add", "code.txt"]);
  await h.git("git", ["commit", "-m", "Change code\n\nContext: tasks-alpha.md (Task 1.1)"]);
  let sha = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  if (problem === "merge") {
    await h.git("git", ["switch", "-c", "other-side", base]);
    await writeFile(join(h.root, "other.txt"), "Other code\n");
    await h.git("git", ["add", "other.txt"]);
    await h.git("git", ["commit", "-m", "Other side"]);
    await h.git("git", ["switch", "feat/alpha"]);
    await h.git("git", ["merge", "--no-ff", "other-side", "-m", "Merge code\n\nContext: tasks-alpha.md (Task 1.1)"]);
    sha = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  } else if (problem === "missing-author") {
    const tree = (await h.git("git", ["rev-parse", "HEAD^{tree}"])).stdout.trim();
    const raw = `tree ${tree}\nparent ${base}\ncommitter Example <example@example.com> 1700000000 +0000\n\nChange code\n\nContext: tasks-alpha.md (Task 1.1)\n`;
    sha = (await h.ports.execInput(["hash-object", "--literally", "-t", "commit", "-w", "--stdin"], raw, { cwd: h.root })).trim();
    await h.git("git", ["update-ref", "refs/heads/feat/alpha", sha]);
  }
  await h.git("git", ["switch", "main"]);
  if (problem === "unreadable-patch") {
    const blob = (await h.git("git", ["rev-parse", `${sha}:code.txt`])).stdout.trim();
    const object = (await h.git("git", ["rev-parse", "--git-path", `objects/${blob.slice(0, 2)}/${blob.slice(2)}`])).stdout.trim();
    await unlink(resolve(h.root, object));
  }
  const source = createStore(createDefaultStorePorts({ checkoutRoot: h.root }));
  expect(success(await source.lookup({ kind: "commit", repository: h.root, sha })).taskIds).toEqual(["1.1"]);
  expect((await computeCopyKeys({ cwd: h.root, commits: [sha], execRaw: h.ports.rawExec })).get(sha)?.copyKey).toBeUndefined();
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports), repository = await projectId(store);
  const record = success(await store.read({ reference: RecordReferenceSchema.parse({
    kind: "work-item/meta", owner: { type: "work-item", name: "alpha" },
  }) }));
  expect(Object.values(record.links?.taskCaptures ?? {}).flat().map(capture => capture.sha)).not.toContain(sha);
  expect(await store.lookup({ kind: "commit", repository, sha })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  if (problem === "merge") expect(record.links?.branches?.[0]?.excluded.map(capture => capture.sha)).not.toContain(sha);
  else expect(record.links?.branches?.[0]?.excluded).toContainEqual({ repository, sha });
}, 30_000);

describe.each(["default", "separate"] as const)("imported links in %s", layout => {
  if (layout === "default") {
    it("links a live branch to the same primary as the source lookup", async () => {
      const h = await importComparisonFixture(layout);
      expect(await h.target.migrate()).toMatchObject({ status: "ok" });
      const repository = await projectId(h.store);
      const primary = success(await h.store.read({ reference: RecordReferenceSchema.parse({
        kind: "work-item/meta", owner: { type: "work-item", name: "alpha" },
      }) }));
      expect(primary.links?.branches).toEqual([{ repository, ref: "feat/alpha", linkedAs: "created", excluded: [] }]);
      const source = createStore(createDefaultStorePorts({ checkoutRoot: h.source.root }));
      const before = success(await source.lookup({ kind: "ref", repository: h.source.root, ref: "feat/alpha" }));
      const after = success(await h.store.lookup({ kind: "ref", repository, ref: "feat/alpha" }));
      expect(after.reference.kind).toBe(before.reference.kind);
      expect(after.reference.owner.name).toBe(before.reference.owner.name);
      expect(await h.compare()).toEqual([]);
    }, 30_000);
  }

  it("captures only closed footer tasks and retains every remaining non-merge branch commit as excluded", async () => {
    const histories = new Map<string, { setup: string; closed: string; open: string; empty: string }>();
    const h = await importComparisonFixture(layout, async fixture => {
      await fixture.git("git", ["switch", "feat/alpha"]);
      await writeFile(join(fixture.root, ".arc/active/tasks-alpha.md"), "# Task List: Alpha\n\n## **Phase 1:** Work\n\n### `[x]` **1.1 Finished**\n\n- _Goal:_ Finish.\n\n### `[ ]` **1.2 Open**\n\n- _Goal:_ Continue.\n\n### `[~]` **1.3 Deferred**\n\n- _Goal:_ Defer.\n");
      await fixture.git("git", ["add", ".arc/active/tasks-alpha.md"]);
      await fixture.git("git", ["commit", "-m", "Prepare task markers"]);
      const head = async () => (await fixture.git("git", ["rev-parse", "HEAD"])).stdout.trim();
      const setup = await head();
      await writeFile(join(fixture.root, "work.txt"), "closed work\n");
      await fixture.git("git", ["add", "work.txt"]);
      await fixture.git("git", ["commit", "-m", "Close a range\n\nContext: tasks-alpha.md (Tasks 1.1-1.3)"]);
      const closed = await head();
      await writeFile(join(fixture.root, "work.txt"), "open work\n");
      await fixture.git("git", ["add", "work.txt"]);
      await fixture.git("git", ["commit", "-m", "Continue work\n\nContext: tasks-alpha.md (Task 1.2)"]);
      const open = await head();
      await fixture.git("git", ["commit", "--allow-empty", "-m", "Empty change\n\nContext: tasks-alpha.md (Task 1.3)"]);
      histories.set(fixture.root, { setup, closed, open, empty: await head() });
    });
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    const repository = await projectId(h.store), facts = histories.get(h.target.root)!;
    const meta = success(await h.store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }) }));
    const keys = await computeCopyKeys({ cwd: h.target.root, commits: Object.values(facts), execRaw: h.target.ports.rawExec });
    const capture = { repository, sha: facts.closed, copyKey: keys.get(facts.closed)?.copyKey };
    expect(capture.copyKey).toMatch(/^v1:/u);
    expect(meta.links?.taskCaptures).toEqual({ "1.1": [capture], "1.3": [capture] });
    const excluded = meta.links?.branches?.[0]?.excluded;
    expect(excluded?.map(commit => commit.sha).sort()).toEqual([facts.setup, facts.open, facts.empty].sort());
    expect(excluded).toContainEqual({ repository, sha: facts.empty });
    const source = createStore(createDefaultStorePorts({ checkoutRoot: h.source.root }));
    const before = success(await source.lookup({ kind: "commit", repository: h.source.root, sha: histories.get(h.source.root)!.closed }));
    const after = success(await h.store.lookup({ kind: "commit", repository, sha: facts.closed }));
    expect(after.reference.owner.name).toBe(before.reference.owner.name);
    expect(after.taskIds).toEqual(before.taskIds?.filter(task => task !== "1.2"));
    expect(await h.store.lookup({ kind: "commit", repository, sha: facts.empty })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await h.store.lookup({ kind: "commit", repository, sha: facts.open })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await h.compare()).toEqual([]);
  }, 30_000);
});

it.each(["remote-only", "remote-ahead", "local-ahead"] as const)("uses the containing branch tip for %s code", async state => {
  const h = await importFixture();
  const initial = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  await h.git("git", ["switch", "feat/alpha"]);
  await writeFile(join(h.root, "branch-work.txt"), "new branch work\n");
  await h.git("git", ["add", "branch-work.txt"]);
  await h.git("git", ["commit", "-m", "Advance branch work"]);
  const advanced = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["switch", "main"]);
  await h.git("git", ["update-ref", "refs/remotes/origin/feat/alpha", state === "local-ahead" ? initial : advanced]);
  if (state === "remote-only") await h.git("git", ["branch", "-D", "feat/alpha"]);
  if (state === "remote-ahead") await h.git("git", ["update-ref", "refs/heads/feat/alpha", initial]);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const record = success(await createRefStore(h.ports).read({ reference: RecordReferenceSchema.parse({
    kind: "work-item/meta", owner: { type: "work-item", name: "alpha" },
  }) }));
  expect(record.links?.branches?.[0]?.excluded.map(commit => commit.sha)).toEqual([advanced]);
}, 30_000);

it.each(["plan/alpha", "custom-type/alpha", "maintenance", "[none]", "main"])("uses the primary's %s branch metadata", async branch => {
  const h = await importFixture();
  const path = join(h.root, ".arc/active/meta-alpha.md");
  let content = setMetaBranch(await readFile(path, "utf8"), branch);
  if (branch === "plan/alpha") content = setMetaState(content, "Planning");
  await writeFile(path, content);
  await h.git("git", ["add", path]);
  await h.git("git", ["commit", "-m", "Set branch metadata"]);
  if (branch !== "[none]" && branch !== "main") await h.git("git", ["branch", branch]);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  const record = success(await store.read({ reference: RecordReferenceSchema.parse({
    kind: "work-item/meta", owner: { type: "work-item", name: "alpha" },
  }) }));
  if (branch === "[none]" || branch === "main") expect(record.links?.branches).toBeUndefined();
  else {
    expect(record.links?.branches).toEqual([{ repository: await projectId(store), ref: branch,
      linkedAs: branch === "maintenance" ? "adopted" : "created", excluded: [] }]);
  }
}, 30_000);

it("reports a missing configured base even for a primary naming that base and lands after it is restored", async () => {
  const h = await importFixture();
  await h.git("git", ["branch", "-m", "main", "trunk"]);
  const configPath = join(h.root, ".arc/system/arc-config.yml");
  await writeFile(configPath, "branch.base: trunk\n");
  const metaPath = join(h.root, ".arc/active/meta-alpha.md");
  await writeFile(metaPath, setMetaBranch(await readFile(metaPath, "utf8"), "trunk"));
  await h.git("git", ["add", metaPath, configPath]);
  await h.git("git", ["commit", "-m", "Name the base branch"]);
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["switch", "--detach"]);
  await h.git("git", ["branch", "-D", "trunk"]);
  const failed = await h.migrate();
  expect(failed).toMatchObject({ status: "refused", refusal: { code: "import-refused", report: { notices: expect.arrayContaining([
    { condition: "No base ref resolves for trunk.", remedy: { text: "git fetch origin +refs/heads/trunk:refs/remotes/origin/trunk" } },
  ]) } } });
  await h.git("git", ["branch", "trunk", head]);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const record = success(await createRefStore(h.ports).read({ reference: RecordReferenceSchema.parse({
    kind: "work-item/meta", owner: { type: "work-item", name: "alpha" },
  }) }));
  expect(record.links?.branches).toBeUndefined();
}, 30_000);

it.each(["missing", "diverged"] as const)("reports a %s branch before other refusals and lands after repair", async problem => {
  const h = await importFixture();
  const initial = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  if (problem === "missing") await h.git("git", ["branch", "-D", "feat/alpha"]);
  else {
    await h.git("git", ["switch", "feat/alpha"]);
    await writeFile(join(h.root, "local-work.txt"), "local work\n");
    await h.git("git", ["add", "local-work.txt"]);
    await h.git("git", ["commit", "-m", "Advance local work"]);
    await h.git("git", ["switch", "-c", "remote-side", initial]);
    await writeFile(join(h.root, "remote-work.txt"), "remote work\n");
    await h.git("git", ["add", "remote-work.txt"]);
    await h.git("git", ["commit", "-m", "Advance remote work"]);
    const remote = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["update-ref", "refs/remotes/origin/feat/alpha", remote]);
    await h.git("git", ["switch", "main"]);
  }
  const inboxPath = join(h.root, resolveArcPath({ kind: "inbox", scope: { kind: "project" } }));
  await writeFile(inboxPath, IMPORT_INBOX.replace("### **First**\n\n", "### **First**\n\n- _Id:_ `11111111`\n"));
  await h.git("git", ["add", inboxPath]);
  await h.git("git", ["commit", "-m", "Seed duplicate source identities"]);
  const trialResult = await h.migrate(true);
  expect(trialResult.status).toBe("ok");
  if (trialResult.status !== "ok") throw new Error("Import trial did not return its report");
  const trial = trialResult.result;
  expect(trial.refused.map(item => item.rule)).toEqual([`branch-${problem}`, "entry-id"]);
  expect(trial.notices).toEqual(expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining("feat/alpha"), remedy: expect.objectContaining({ text: expect.stringContaining(problem === "missing" ? "Archive" : "Merge") }),
  })]));
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  await writeFile(inboxPath, IMPORT_INBOX);
  await h.git("git", ["add", inboxPath]);
  await h.git("git", ["commit", "-m", "Repair source identities"]);
  if (problem === "missing") await h.git("git", ["branch", "feat/alpha", initial]);
  else {
    await h.git("git", ["switch", "feat/alpha"]);
    await h.git("git", ["merge", "--no-edit", "refs/remotes/origin/feat/alpha"]);
    await h.git("git", ["switch", "main"]);
  }
  expect(await h.migrate()).toMatchObject({ status: "ok" });
}, 30_000);

it("lands an import over a task list the scanner rejects, deriving no captures from it and reporting the skip", async () => {
  const h = await importComparisonFixture("default", async fixture => {
    await fixture.git("git", ["switch", "feat/alpha"]);
    await writeFile(join(fixture.root, ".arc/active/tasks-alpha.md"), "# Task List: Alpha\n\n### Phase 1: Work\n\n- [x] 1.1 Finished the older way\n");
    await fixture.git("git", ["add", ".arc/active/tasks-alpha.md"]);
    await fixture.git("git", ["commit", "-m", "Keep the older task markers"]);
    await writeFile(join(fixture.root, "work.txt"), "closed work\n");
    await fixture.git("git", ["add", "work.txt"]);
    await fixture.git("git", ["commit", "-m", "Close the task\n\nContext: tasks-alpha.md (Task 1.1)"]);
  });
  const migrated = await h.target.migrate();
  expect(migrated).toMatchObject({ status: "ok" });
  expect(migrated.status === "ok" ? migrated.result.notices : []).toContainEqual(
    { condition: "Task list for 'alpha' cannot be scanned, so no task captures are derived from it." });
  const meta = success(await h.store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }) }));
  expect(meta.links?.taskCaptures).toBeUndefined();
}, 30_000);

it("lands an import whose commit footers name a slug two work items hold, deriving no captures from them and reporting the skip", async () => {
  const tasks = (title: string) => `# Task List: ${title}\n\n## **Phase 1:** Work\n\n### \`[x]\` **1.1 Finished**\n\n- _Goal:_ Finish.\n`;
  const h = await importComparisonFixture("default", async fixture => {
    await fixture.git("git", ["switch", "feat/alpha"]);
    await writeFile(join(fixture.root, ".arc/active/tasks-alpha.md"), tasks("Alpha"));
    // The ended work item was renamed from the slug the active one now holds.
    const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q3"), sequence: ArchiveSequenceSchema.parse("56") };
    for (const [path, content] of [
      [resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("beta"), placement }),
        makeMetaFixture("beta", { state: "Shipped", owner: "andrew", branch: null, completed: "2026-10-01", prUrl: "https://example.test/pull/2" })],
      [resolveArcPath({ kind: "work-unit-artifact", artifact: "tasks", slug: SlugSchema.parse("beta"), placement }), tasks("Beta")],
      [resolveArcPath({ kind: "transition-record", origin: SlugSchema.parse("alpha") }),
        writeLineageRecord(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: "alpha" }, kind: "rename", successors: [{ name: "beta" }], incoming: [] }))],
    ] as const) {
      await mkdir(dirname(join(fixture.root, path)), { recursive: true });
      await writeFile(join(fixture.root, path), content);
    }
    await fixture.git("git", ["add", ".arc"]);
    await fixture.git("git", ["commit", "-m", "Reuse a former slug"]);
    await writeFile(join(fixture.root, "work.txt"), "closed work\n");
    await fixture.git("git", ["add", "work.txt"]);
    await fixture.git("git", ["commit", "-m", "Close the task\n\nContext: tasks-alpha.md (Task 1.1)"]);
  });
  const migrated = await h.target.migrate();
  expect(migrated, JSON.stringify(migrated)).toMatchObject({ status: "ok" });
  expect(migrated.status === "ok" ? migrated.result.notices : []).toContainEqual(
    { condition: "Commit footers name work item 'alpha', which more than one imported work item holds, so no task captures are derived from them." });
  const meta = success(await h.store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }) }));
  expect(meta.links?.taskCaptures).toBeUndefined();
}, 30_000);
