/** The import's records do not depend on the order in which branches, worktrees, or fetched refs are listed. */
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { expect, it, onTestFinished } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/index.js";
import { KIND_REGISTRY } from "../../src/lib/store/registry.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { composePointerRecord } from "../../src/lib/work-unit/pointer-record.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import type { StoreRecord } from "../../src/lib/store/read.js";

const execFileAsync = promisify(execFile);
type Fixture = Awaited<ReturnType<typeof importFixture>>;

/** Commit with fixed times, so two copies prepared alike hold the same commits. */
async function commit(cwd: string, message: string): Promise<void> {
  const date = "2026-03-04T05:06:07.000Z";
  await execFileAsync("git", ["commit", "-m", message], { cwd, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
}

async function addMeta(h: Fixture, cwd: string, slug: string, branch: string): Promise<void> {
  await mkdir(join(cwd, ".arc/active"), { recursive: true });
  await writeFile(join(cwd, `.arc/active/meta-${slug}.md`), makeMetaFixture(slug, { owner: "andrew", branch }));
  await h.git("git", ["-C", cwd, "add", ".arc"]);
  await commit(cwd, `Start ${slug}`);
}

/** Copies the quiesce check admits: each work unit's copies are one commit, and the parked unit is read from its branch. */
async function prepare(h: Fixture): Promise<void> {
  for (const slug of ["beta", "gamma", "epsilon"]) {
    await h.git("git", ["switch", "-c", `feat/${slug}`, "main"]);
    await addMeta(h, h.root, slug, `feat/${slug}`);
    await h.git("git", ["switch", "main"]);
  }
  await h.git("git", ["push", "origin", "main", "feat/beta", "feat/gamma", "feat/epsilon"]);
  await h.git("git", ["branch", "-D", "feat/gamma"]);
  await h.git("git", ["fetch", "origin"]);
  const pointer = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("epsilon"),
    placement: { kind: "backlog", commitment: "planned", cohort: [] } });
  await mkdir(dirname(join(h.root, pointer)), { recursive: true });
  await writeFile(join(h.root, pointer), composePointerRecord({ name: "epsilon", branch: "feat/epsilon",
    reason: "Wait for the upstream dependency.", renderFields: { owner: "andrew" } }));
  await h.git("git", ["add", ".arc"]);
  await commit(h.root, "Park epsilon");
  for (const slug of ["delta", "zeta"]) {
    const worktree = join(dirname(h.root), `${basename(h.root)}-${slug}`);
    onTestFinished(() => rm(worktree, { recursive: true, force: true }));
    await h.git("git", ["worktree", "add", "-b", `feat/${slug}`, worktree, "main"]);
    await addMeta(h, worktree, slug, `feat/${slug}`);
  }
}

function reverseLines(text: string): string {
  const lines = text.split("\n"), trailing = lines.at(-1) === "" ? lines.pop() : undefined;
  return [...lines.reverse(), ...(trailing === undefined ? [] : [""])].join("\n");
}

/** Keep the main worktree first, as Git does, and reverse the linked ones. */
function reverseLinkedWorktrees(text: string): string {
  const records = text.split("\0\0").filter(record => record !== "");
  const [main, ...linked] = records;
  return main === undefined ? text : `${[main, ...linked.reverse()].join("\0\0")}\0\0`;
}

/** Reverse every listing of branches, fetched refs, and worktrees the import's reads take. */
function permuted(exec: GitExec, seen: Set<string>): GitExec {
  return async (command, args, options) => {
    const result = await exec(command, args, options);
    if (args.includes("for-each-ref") && args.some(arg => arg.startsWith("refs/heads") || arg.startsWith("refs/remotes"))) {
      seen.add("refs");
      return { ...result, stdout: reverseLines(result.stdout) };
    }
    if (args.includes("worktree") && args.includes("list") && args.includes("-z")) {
      seen.add("worktrees");
      return { ...result, stdout: reverseLinkedWorktrees(result.stdout) };
    }
    return result;
  };
}

/** Every imported record keyed by owner and path, with each minted UID mapped to its owner. */
async function importedRecords(h: Fixture): Promise<Record<string, unknown>> {
  const store = createRefStore(h.ports), records: StoreRecord[] = [];
  for (const definition of Object.values(KIND_REGISTRY)) {
    const listed = success(await store.list({ family: definition.family, kind: definition.id }));
    if (listed.status === "absent") continue;
    if (listed.status !== "complete") throw new Error(`Incomplete ${definition.id} listing`);
    records.push(...listed.records);
  }
  const owners = new Map<string, string>();
  for (const { reference: { owner } } of records) if ("uid" in owner && owner.uid !== undefined) owners.set(owner.uid, `${owner.type}:${owner.name}`);
  const mask = (text: string) => [...owners].reduce((masked, [uid, owner]) => masked.replaceAll(uid, `<${owner}>`), text);
  return Object.fromEntries(records.map(record => [
    mask(canonicalize({ kind: record.reference.kind, owner: `${record.reference.owner.type}:${record.reference.owner.name}`,
      key: record.reference.key ?? null, placement: record.placement ?? null })),
    JSON.parse(mask(JSON.stringify({ content: record.content, links: record.links ?? null, fields: record.fields ?? null }))),
  ]));
}

it("imports the same records whatever order branches, worktrees, and fetched refs are listed in, a parked unit among them", async () => {
  const [listed, reordered] = await Promise.all([importFixture("default"), importFixture("default")]);
  await prepare(listed);
  await prepare(reordered);
  const seen = new Set<string>();
  reordered.ports.exec = permuted(reordered.ports.exec, seen);
  expect(await listed.migrate()).toMatchObject({ status: "ok" });
  expect(await reordered.migrate()).toMatchObject({ status: "ok" });
  expect([...seen].sort()).toEqual(["refs", "worktrees"]);
  const expected = await importedRecords(listed);
  expect(Object.keys(expected).filter(key => key.includes("\"work-item/meta\"")).map(key => JSON.parse(key).owner).sort())
    .toEqual(["work-item:alpha", "work-item:beta", "work-item:delta", "work-item:epsilon", "work-item:gamma", "work-item:zeta"]);
  expect(await importedRecords(reordered)).toEqual(expected);
}, 120_000);
