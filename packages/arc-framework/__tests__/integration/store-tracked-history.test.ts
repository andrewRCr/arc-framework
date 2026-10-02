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
      { reference: reference(), version: version(second), provenance: { message: "second state\n" } },
      { reference: reference(), version: version(first), provenance: { message: "first state\n\nContext: tasks-example.md (Task 1.1)\n" } },
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
      { reference: reference("renamed"), version: version(renamed), provenance: { message: "rename work unit\n" } },
      { reference: reference("renamed"), version: version(content), provenance: { message: "before rename\n" } },
    ]);
  });
  it.each(["all", "meta", "notes"] as const)("reports chronological provenance for endpoint changes restricted to %s", async (restriction) => {
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
    expect(success(await repo.store.changes({ from, to, references }))).toEqual(restriction === "notes" ? [] : [
      { reference: reference(), version: version(middle), provenance: { message: "first mutation\n" } },
      { reference: reference(), version: version(final), provenance: { message: "second mutation\n" } },
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
      { reference: recordReferences["work-item/notes"](reference().owner), version: version(notes), provenance: { message: "add tracked records\n" } },
      { reference: recordReferences["lineage/transition"](reference("retired").owner), version: version(transition), provenance: { message: "add tracked records\n" } },
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
      { reference: reference(), version: null, provenance: { message: "remove work unit\n" } },
    ]);
    expect(success(await repo.store.history({ reference: reference() }))).toEqual([
      { reference: reference(), version: null, provenance: { message: "remove work unit\n" } },
      { reference: reference(), version: version(content), provenance: { message: "create work unit\n" } },
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
      { reference: reference(), version: version(content), provenance: { message: "move placement\n" } },
    ]);
  });
});
