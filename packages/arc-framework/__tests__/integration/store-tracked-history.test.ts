/** Saved-state and provenance behavior through the public repository store. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { OwnerIdentitySchema, recordReferences, StateVersionSchema } from "../../src/lib/store/identity.js";
import { digestBytes } from "../../src/lib/kernel/canonical/canonical-json.js";
import { serializeTransitionRecord } from "../../src/lib/work-unit/transition-record.js";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
import { success } from "../helpers/store/suite-tools.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });
const reference = (name = "example") => recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name }));
const version = (content: string) => digestBytes(Buffer.from(content));

async function repository() {
  const root = await createTempRepo("arc-store-history-"); roots.push(root);
  const exec = makeGitExec(root);
  const store = createStore(testStorePorts(root, exec, makeGitExecInput(root)));
  async function put(path: string, content: string) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  async function commit(message: string) {
    await exec("git", ["add", "-A"]);
    await exec("git", ["commit", "--allow-empty", "-m", message]);
    return StateVersionSchema.parse((await exec("git", ["rev-parse", "HEAD"])).stdout.trim());
  }
  return { root, exec, store, put, commit };
}

describe("tracked state and history", () => {
  it.each(["work-item/draft","work-item/notes","work-item/companion"] as const)("preserves historical %s absence after same-branch creation", async (kind) => {
    const repo = await repository();
    await repo.put(".arc/active/meta-example.md",makeMetaFixture("example",{branch:"main"}));
    const asOf = await repo.commit("owner without companion");
    const companion = kind === "work-item/companion" ? recordReferences[kind](reference().owner,"research") : recordReferences[kind](reference().owner);
    const before = await repo.store.read({reference:companion,asOf});
    expect(before).toMatchObject({status:"refused",refusal:{code:"not-found"}});
    const prefix = kind === "work-item/draft" ? "draft" : kind === "work-item/notes" ? "notes" : "research";
    const content = "created later on the same branch\n";
    await repo.put(`.arc/active/${prefix}-example.md`,content);
    await repo.commit("later companion creation");
    expect(await repo.store.read({reference:companion,asOf})).toEqual(before);
    const live = success(await repo.store.read({reference:companion}));
    expect(live.content).toBe(content);
    expect(success(await repo.store.history({reference:companion}))).toMatchObject([{content,version:live.version}]);
  });

  it.each(["work-item/draft","work-item/notes","work-item/companion"] as const)("distinguishes an uncovered %s from true companion absence", async (kind) => {
    const repo = await repository();
    const empty = await repo.commit("empty base");
    const stub = ".arc/backlog/planned/example/meta-example.md";
    await repo.put(stub,makeMetaFixture("example",{state:"Planning",branch:null}));
    const baseline = await repo.commit("planned stub");
    await repo.exec("git",["checkout","-b","feat/example"]);
    await repo.exec("git",["rm",stub]);
    await repo.put(".arc/active/meta-example.md",makeMetaFixture("example",{branch:"feat/example"}));
    const prefix = kind === "work-item/draft" ? "draft" : kind === "work-item/notes" ? "notes" : "research";
    await repo.put(`.arc/active/${prefix}-example.md`,"on owning branch\n");
    await repo.commit("live companion");
    await repo.exec("git",["checkout","main"]);
    const companion = kind === "work-item/companion" ? recordReferences[kind](reference().owner,"research") : recordReferences[kind](reference().owner);
    const absent = recordReferences["work-item/spec"](reference().owner);
    for (const asOf of [empty,baseline]) {
      expect(await repo.store.read({reference:companion,asOf})).toMatchObject({status:"refused",refusal:{code:"unsupported",case:"uncovered-state-version",remedy:{text:expect.stringContaining("per-record version")}}});
      expect(await repo.store.read({reference:absent,asOf})).toMatchObject({status:"refused",refusal:{code:"not-found"}});
    }
    const live = success(await repo.store.read({reference:companion}));
    expect(live.content).toBe("on owning branch\n");
    expect(success(await repo.store.read({reference:companion})).version).toBe(live.version);
  });

  for (const mode of ["creation","removal","both"] as const) {
    it.each(["all","meta","notes"] as const)(`reports raw parser-rejected ${mode} changes restricted to %s`, async (restriction) => {
      const repo = await repository();
      const path = ".arc/active/meta-example.md";
      const notesPath = ".arc/active/notes-example.md";
      const malformed = (label:string)=>`# Bad meta\n\n| State | Owner | Branch | Class | Priority |\n|---|---|---|---|---|\n| \`Active\` | \`andrew\` |\n\n${label}\n`;
      if (mode !== "creation") {
        await repo.put(path,malformed("before"));
        await repo.put(notesPath,"notes before\n");
      }
      const from = await repo.commit("before raw mutation");
      if (mode === "removal") await repo.exec("git",["rm",path,notesPath]);
      else {
        await repo.put(path,malformed("after"));
        await repo.put(notesPath,"notes after\n");
      }
      const to = await repo.commit("raw mutation");
      expect(success(await repo.store.list({family:"work-item",kind:"work-item/meta",asOf:mode === "removal" ? from : to})))
        .toMatchObject({status:"complete",records:[],missed:true,diagnostics:[{kind:"malformed",key:path}]});
      const notes = recordReferences["work-item/notes"](reference().owner);
      const references = restriction === "all" ? undefined : [restriction === "meta" ? reference() : notes];
      const changed = success(await repo.store.changes({from,to,references}));
      const expected = [
        {reference:reference(),version:mode === "removal" ? null : version(malformed("after"))},
        {reference:notes,version:mode === "removal" ? null : version("notes after\n")},
      ].filter((entry)=>restriction === "all" || entry.reference.kind === (restriction === "meta" ? "work-item/meta" : "work-item/notes"));
      expect(changed.map(({reference,version})=>({reference,version}))).toEqual(expected);
    });
  }

  it("anchors at HEAD and ignores working-copy edits until their commit lands", async () => {
    const repo = await repository();
    await repo.put(".arc/active/meta-example.md", makeMetaFixture("example"));
    const first = await repo.commit("first state");
    expect(success(await repo.store.version())).toBe(first);
    await repo.put(".arc/active/meta-example.md", "uncommitted bytes");
    expect(success(await repo.store.version())).toBe(first);
    const second = await repo.commit("second state");
    expect(success(await repo.store.version())).toBe(second);
    expect(second).not.toBe(first);
  });
  it("returns landed meta versions newest first with exact commit messages", async () => {
    const repo = await repository();
    const first = makeMetaFixture("example");
    await repo.put(".arc/active/meta-example.md", first);
    await repo.commit("first state\n\nContext: tasks-example.md (Task 1.1)");
    const second = `${first}\nAdditional progress\n`;
    await repo.put(".arc/active/meta-example.md", second);
    await repo.commit("second state");
    await repo.put(".arc/active/meta-example.md", "uncommitted edit");
    expect(success(await repo.store.history({ reference: reference() }))).toEqual([
      { reference: reference(), version: version(second), content: second, provenance: { message: "second state\n" } },
      { reference: reference(), version: version(first), content: first, provenance: { message: "first state\n\nContext: tasks-example.md (Task 1.1)\n" } },
    ]);
  });
  it("follows the meta file across a real Git rename", async () => {
    const repo = await repository();
    const content = makeMetaFixture("example");
    await repo.put(".arc/active/meta-example.md", content);
    await repo.commit("before rename");
    await repo.exec("git", ["mv", ".arc/active/meta-example.md", ".arc/active/meta-renamed.md"]);
    const renamed = makeMetaFixture("renamed");
    await repo.put(".arc/active/meta-renamed.md", renamed);
    await repo.commit("rename work unit");
    expect(success(await repo.store.history({ reference: reference("renamed") }))).toEqual([
      { reference: reference("renamed"), version: version(renamed), content: renamed, provenance: { message: "rename work unit\n" } },
      { reference: reference("renamed"), version: version(content), content: content, provenance: { message: "before rename\n" } },
    ]);
  });
  it.each(["all", "meta", "notes"] as const)("reports chronological landed mutations restricted to %s", async (restriction) => {
    const repo = await repository();
    const path = ".arc/active/meta-example.md";
    const initial = makeMetaFixture("example");
    await repo.put(path, initial);
    await repo.put(".arc/active/notes-example.md", "original notes\n");
    const from = await repo.commit("baseline");
    const middle = `${initial}\nFirst progress\n`;
    await repo.put(path, middle);
    await repo.put(".arc/active/notes-example.md", "temporary notes\n");
    await repo.commit("first mutation");
    const final = `${initial}\nFinal progress\n`;
    await repo.put(path, final);
    await repo.put(".arc/active/notes-example.md", "original notes\n");
    await repo.commit("second mutation");
    await repo.put("README.md", "unrelated\n");
    const to = await repo.commit("unrelated code");
    const notes = recordReferences["work-item/notes"](reference().owner);
    const references = restriction === "all" ? undefined : [restriction === "meta" ? reference() : notes];
    const expected = [
      { reference: reference(), version: version(middle), content: middle, provenance: { message: "first mutation\n" } },
      { reference: notes, version: version("temporary notes\n"), content: "temporary notes\n", provenance: { message: "first mutation\n" } },
      { reference: reference(), version: version(final), content: final, provenance: { message: "second mutation\n" } },
      { reference: notes, version: version("original notes\n"), content: "original notes\n", provenance: { message: "second mutation\n" } },
    ].filter((entry) => restriction === "all" || entry.reference.kind === (restriction === "meta" ? "work-item/meta" : "work-item/notes"));
    expect(success(await repo.store.changes({ from, to, references }))).toEqual(expected);
  });

  it.each(["all", "meta", "notes", "transition"] as const)("keeps creation and removal inside an empty-ended interval restricted to %s", async (restriction) => {
    const repo = await repository();
    const from = await repo.commit("empty baseline");
    const content = makeMetaFixture("example", { branch: "main" });
    const notes = "temporary notes\n";
    const transition = serializeTransitionRecord({ schemaVersion: 1, origin: "retired", kind: "abandon", successors: [], edges: [] });
    const records = [
      { name: "meta", reference: reference(), content, path: ".arc/active/meta-example.md" },
      { name: "notes", reference: recordReferences["work-item/notes"](reference().owner), content: notes, path: ".arc/active/notes-example.md" },
      { name: "transition", reference: recordReferences["lineage/transition"](reference("retired").owner), content: transition, path: ".arc/system/.internal/transitions/retired.json" },
    ];
    for (const record of records) await repo.put(record.path, record.content);
    await repo.commit("temporary creation");
    await repo.exec("git", ["rm", ...records.map((record) => record.path)]);
    const to = await repo.commit("temporary removal");
    const selected = records.filter((record) => restriction === "all" || record.name === restriction);
    const changes = success(await repo.store.changes({ from, to,
      ...(restriction === "all" ? {} : { references: selected.map((record) => record.reference) }) }));
    expect(changes).toHaveLength(selected.length * 2);
    for (const record of selected) expect(changes.filter((entry) => entry.reference.kind === record.reference.kind)).toEqual([
      { reference: record.reference, content: record.content, version: version(record.content), provenance: { message: "temporary creation\n" } },
      { reference: record.reference, content: null, version: null, provenance: { message: "temporary removal\n" } },
    ]);
  });
  it.each(["foreign", "missing"] as const)("distinguishes a %s record outside the saved branch states", async (name) => {
    const repo = await repository();
    const baseline = await repo.commit("base state");
    await repo.exec("git", ["checkout", "-b", "feat/foreign"]);
    await repo.put(".arc/active/meta-foreign.md", makeMetaFixture("foreign"));
    await repo.commit("another branch's record");
    await repo.exec("git", ["checkout", "main"]);
    const result = await repo.store.changes({ from: baseline, to: baseline, references: [reference(name)] });
    expect(result).toMatchObject({ status: "refused", refusal: name === "foreign"
      ? { code: "unsupported", class: "recoverable", case: "uncovered-state-version", remedy: { text: expect.stringContaining("per-record version") } }
      : { code: "not-found", class: "recoverable", remedy: { text: expect.any(String) } } });
    if (name === "foreign") {
      const live = success(await repo.store.read({ reference: reference(name) }));
      expect(success(await repo.store.read({ reference: reference(name) }))).toMatchObject({ version: live.version, content: makeMetaFixture("foreign") });
    }
  });
  it("does not invent a mutation for a merge that retains its first parent's record", async () => {
    const repo = await repository();
    const initial = makeMetaFixture("example", { branch: "main" });
    await repo.put(".arc/active/meta-example.md", initial);
    const from = await repo.commit("baseline");
    await repo.exec("git", ["checkout", "-b", "side"]);
    await repo.put("README.md", "side code\n");
    await repo.commit("side code only");
    await repo.exec("git", ["checkout", "main"]);
    const content = `${initial}\nmain progress\n`;
    await repo.put(".arc/active/meta-example.md", content);
    await repo.commit("main record edit");
    await repo.exec("git", ["merge", "--no-ff", "side", "-m", "merge code"]);
    const to = success(await repo.store.version());
    expect(success(await repo.store.changes({ from, to, references: [reference()] }))).toEqual([
      { reference: reference(), content, version: version(content), provenance: { message: "main record edit\n" } },
    ]);
  });
  it("names companion additions and terminal records through the tracked listing inventory", async () => {
    const repo = await repository();
    await repo.put(".arc/active/meta-example.md", makeMetaFixture("example"));
    const from = await repo.commit("baseline");
    const notes = "new notes\n";
    const transition = serializeTransitionRecord({ schemaVersion: 1, origin: "retired", kind: "abandon", successors: [], edges: [] });
    await repo.put(".arc/active/notes-example.md", notes);
    await repo.put(".arc/system/.internal/transitions/retired.json", transition);
    const to = await repo.commit("add tracked records");
    const entries = success(await repo.store.changes({ from, to }));
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(expect.arrayContaining([
      { reference: recordReferences["work-item/notes"](reference().owner), version: version(notes), content: notes, provenance: { message: "add tracked records\n" } },
      { reference: recordReferences["lineage/transition"](reference("retired").owner), version: version(transition), content: transition, provenance: { message: "add tracked records\n" } },
    ]));
  });
  it("keeps a removed meta's history and reports its removal with a null version", async () => {
    const repo = await repository();
    const content = makeMetaFixture("example");
    await repo.put(".arc/active/meta-example.md", content);
    const from = await repo.commit("create work unit");
    await repo.exec("git", ["rm", ".arc/active/meta-example.md"]);
    const to = await repo.commit("remove work unit");
    expect(success(await repo.store.changes({ from, to }))).toEqual([
      { reference: reference(), version: null, content: null, provenance: { message: "remove work unit\n" } },
    ]);
    expect(success(await repo.store.history({ reference: reference() }))).toEqual([
      { reference: reference(), version: null, content: null, provenance: { message: "remove work unit\n" } },
      { reference: reference(), version: version(content), content: content, provenance: { message: "create work unit\n" } },
    ]);
  });
  it("reports a selected file's placement move even when its bytes are identical", async () => {
    const repo = await repository();
    const content = makeMetaFixture("example");
    await repo.put(".arc/active/meta-example.md", content);
    const from = await repo.commit("active placement");
    await mkdir(join(repo.root, ".arc/completed/2026-q3/01_example"), { recursive: true });
    await repo.exec("git", ["mv", ".arc/active/meta-example.md", ".arc/completed/2026-q3/01_example/meta-example.md"]);
    const to = await repo.commit("move placement");
    expect(success(await repo.store.changes({ from, to }))).toEqual([
      { reference: reference(), version: version(content), content: content, provenance: { message: "move placement\n" } },
    ]);
  });
});
