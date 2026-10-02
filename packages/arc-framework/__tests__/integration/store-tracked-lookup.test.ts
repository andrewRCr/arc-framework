/** Today's lookup derivations through public store operations and real Git. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { LookupInputSchema } from "../../src/lib/store/lookup.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { serializeTransitionRecord } from "../../src/lib/work-unit/transition-record.js";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
import { success } from "../helpers/store/suite-tools.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });
const owner = (name: string) => OwnerIdentitySchema.parse({ type: "work-item", name });
const meta = (name: string) => recordReferences["work-item/meta"](owner(name));
async function repository() {
  const root = await createTempRepo("arc-store-lookup-"); roots.push(root);
  const exec = makeGitExec(root);
  await exec("git", ["commit", "--allow-empty", "-m", "initial repository"]);
  const store = createStore(testStorePorts(root, exec, makeGitExecInput(root)));
  async function put(path: string, content: string) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  async function commit(message: string) {
    await exec("git", ["add", "-A"]);
    await exec("git", ["commit", "--allow-empty", "-m", message]);
    return (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  }
  return { root, exec, store, put, commit };
}

describe("tracked lookup", () => {
  it.each(["current", "former", "claim"] as const)("resolves a %s work-unit handle", async (handle) => {
    const repo = await repository();
    await repo.put(".arc/active/meta-current.md", makeMetaFixture("current"));
    for (const [origin, successor] of [["former", "middle"], ["middle", "current"]]) {
      await repo.put(`.arc/system/.internal/transitions/${origin}.json`, serializeTransitionRecord({
        schemaVersion: 1, origin: origin!, kind: "rename", successors: [successor!], edges: [],
      }));
    }
    const input = handle === "claim"
      ? { kind: "claim" as const, claim: { kind: "work-unit" as const, slug: SlugSchema.parse("current") } }
      : { kind: "slug" as const, slug: SlugSchema.parse(handle) };
    expect(success(await repo.store.lookup(input))).toEqual({ reference: meta("current") });
  });
  it.each(["decompose", "abandon"] as const)("resolves a %s origin's lineage independently of any surviving meta", async (kind) => {
    const repo = await repository();
    await repo.put(".arc/system/.internal/transitions/retired.json", serializeTransitionRecord({
      schemaVersion: 1, origin: "retired", kind, successors: kind === "decompose" ? ["child"] : [], edges: [],
    }));
    expect(success(await repo.store.lookup({ kind: "lineage", origin: "retired" })))
      .toEqual({ reference: recordReferences["lineage/transition"](owner("retired")) });
  });
  it("conserves both candidates when a former slug is reused by a new live work unit", async () => {
    const repo = await repository();
    for (const name of ["alpha", "beta"]) await repo.put(`.arc/active/meta-${name}.md`, makeMetaFixture(name));
    await repo.put(".arc/system/.internal/transitions/alpha.json", serializeTransitionRecord({
      schemaVersion: 1, origin: "alpha", kind: "rename", successors: ["beta"], edges: [],
    }));
    expect(await repo.store.lookup({ kind: "slug", slug: SlugSchema.parse("alpha") })).toMatchObject({
      status: "refused", refusal: { code: "ambiguous-match", class: "recoverable", candidates: [meta("alpha"), meta("beta")], remedy: { text: expect.any(String) } },
    });
  });
  it.each([
    ["Tasks 1.1, 1.3", true, ["1.1", "1.3"]],
    ["Tasks 1.1-1.3", true, ["1.1", "1.2", "1.3"]],
    ["Tasks 1.1-1.3", false, ["1.1", "1.3"]],
    ["Tasks 1.1-1.4", true, ["1.1", "1.4"]],
  ] as const)("resolves a commit's accepted %s footer with task inventory present=%s", async (expression, withTasks, taskIds) => {
    const repo = await repository();
    await repo.put(".arc/active/meta-example.md", makeMetaFixture("example"));
    if (withTasks) await repo.put(".arc/active/tasks-example.md", [
      "## **Phase 1:** Work", "", "### `[ ]` **1.1 First**", "", "### `[ ]` **1.2 Middle**", "", "### `[ ]` **1.3 Last**", "",
    ].join("\n"));
    const sha = await repo.commit(`feat(test): attribute work\n\nContext: tasks-example.md (${expression})`);
    expect(success(await repo.store.lookup({ kind: "commit", repository: repo.root, sha })))
      .toEqual({ reference: meta("example"), taskIds });
  });
  it.each(["local", "origin", "foreign"] as const)("scopes a branch lookup to its %s repository qualifier", async (qualifier) => {
    const repo = await repository();
    await repo.put(".arc/active/meta-example.md", makeMetaFixture("example"));
    await repo.commit("work unit");
    await repo.exec("git", ["branch", "feat/example"]);
    const url = "https://example.test/team/repository.git";
    await repo.exec("git", ["remote", "add", "origin", url]);
    const qualifierValue = qualifier === "local" ? repo.root : qualifier === "origin" ? url : "https://example.test/foreign.git";
    const result = await repo.store.lookup({ kind: "ref", repository: qualifierValue, ref: "refs/heads/feat/example" });
    if (qualifier === "foreign") expect(result).toMatchObject({ status: "refused", refusal: { code: "not-found", remedy: { text: expect.stringContaining("repository") } } });
    else expect(success(result)).toEqual({ reference: meta("example") });
  });
  it.each(["meta-example.md (handoff)", "draft-example.md (planning)", "spec-example.md (code review)", "tasks-example.md (maintenance)"])("resolves an accepted non-task Context: %s", async (footer) => {
    const repo = await repository();
    await repo.put(".arc/active/meta-example.md", makeMetaFixture("example"));
    const sha = await repo.commit(`chore(test): lifecycle work\n\nContext: ${footer}`);
    expect(success(await repo.store.lookup({ kind: "commit", repository: repo.root, sha }))).toEqual({ reference: meta("example") });
  });
  it("uses the final Context footer as the existing parser's authority", async () => {
    const repo = await repository();
    for (const name of ["example", "earlier"]) await repo.put(`.arc/active/meta-${name}.md`, makeMetaFixture(name));
    const sha = await repo.commit("feat(test): final attribution\n\nContext: tasks-earlier.md (Task 9.1)\nContext: tasks-example.md (Task 1.1)");
    expect(success(await repo.store.lookup({ kind: "commit", repository: repo.root, sha })))
      .toEqual({ reference: meta("example"), taskIds: ["1.1"] });
  });
  it.each(["slug", "lineage", "commit", "ref", "malformed-footer"] as const)("names the missing %s lookup and its repair", async (kind) => {
    const repo = await repository();
    await repo.put(".arc/active/meta-example.md", makeMetaFixture("example"));
    const sha = await repo.commit("feat(test): malformed reference\n\nContext: tasks-example.md (Tasks 1.1 through 1.3)");
    const input = LookupInputSchema.parse(kind === "slug" ? { kind, slug: "missing" }
      : kind === "lineage" ? { kind, origin: "11111111-1111-4111-8111-111111111111" }
        : kind === "ref" ? { kind, repository: repo.root, ref: "feat/missing" }
          : { kind: "commit", repository: repo.root, sha: kind === "commit" ? "0".repeat(40) : sha });
    expect(await repo.store.lookup(input)).toMatchObject({ status: "refused", refusal: {
      code: "not-found", class: "recoverable", lookup: input, remedy: { text: expect.stringContaining("lookup") },
    } });
  });
});
