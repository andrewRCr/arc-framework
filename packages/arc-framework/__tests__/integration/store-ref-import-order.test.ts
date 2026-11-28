/** The import's records do not depend on the order in which branches, worktrees, or fetched refs are listed. */
import { execFile } from "node:child_process";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it, onTestFinished, vi } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { makeTempRoot, removeGitBackedDir } from "../helpers/temp-repo.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/index.js";
import { KIND_REGISTRY } from "../../src/lib/store/registry.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { composePointerRecord } from "../../src/lib/work-unit/pointer-record.js";
import { sanitizeGitRepositoryEnvironment } from "../../src/lib/git/repository-environment.mjs";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";
import { readWindowCheckouts } from "../../src/scripts/cutover-window/checkouts.js";
import { windowUnmarkedCheckoutFindings } from "../../src/scripts/cutover-window/checkout-holders.js";
import { windowCheckoutLockFindings } from "../../src/scripts/cutover-window/lock.js";
import { readWindowCheckoutStatusFindings, readWindowCheckoutUpstreamFindings } from "../../src/scripts/cutover-window/checkout-cleanliness.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import type { StoreRecord } from "../../src/lib/store/read.js";

const execFileAsync = promisify(execFile);
const FIXTURE_DATE = "2026-03-04T05:06:07.000Z";
const BETA_META = ".arc/active/meta-beta.md";
const BETA_NEXT_ACTION = "Run the compatibility checks before publishing.";
type Fixture = Awaited<ReturnType<typeof importFixture>>;

/** Commit with fixed times, so two copies prepared alike hold the same commits. */
async function commit(cwd: string, message: string): Promise<void> {
  const env = sanitizeGitRepositoryEnvironment(process.env);
  await execFileAsync("git", ["commit", "-m", message], {
    cwd, env: { ...env, GIT_AUTHOR_DATE: FIXTURE_DATE, GIT_COMMITTER_DATE: FIXTURE_DATE },
  });
}

async function addMeta(h: Fixture, cwd: string, slug: string, branch: string): Promise<void> {
  await mkdir(join(cwd, ".arc/active"), { recursive: true });
  await writeFile(join(cwd, `.arc/active/meta-${slug}.md`), makeMetaFixture(slug, { owner: "andrew", branch }));
  await h.git("git", ["-C", cwd, "add", ".arc"]);
  await commit(cwd, `Start ${slug}`);
}

/** Keep a fetched-only copy, a parked unit, and an unoccupied branch ahead of its fetched copy. */
async function prepare(h: Fixture): Promise<void> {
  for (const slug of ["beta", "gamma", "epsilon"]) {
    await h.git("git", ["switch", "-c", `feat/${slug}`, "main"]);
    await addMeta(h, h.root, slug, `feat/${slug}`);
    await h.git("git", ["switch", "main"]);
  }
  await h.git("git", ["push", "origin", "feat/beta", "feat/gamma", "feat/epsilon"]);
  await h.git("git", ["branch", "-D", "feat/gamma"]);
  await h.git("git", ["switch", "feat/beta"]);
  await writeFile(join(h.root, BETA_META), makeMetaFixture("beta", {
    owner: "andrew", branch: "feat/beta", nextAction: BETA_NEXT_ACTION,
  }));
  await h.git("git", ["add", "--", BETA_META]);
  await commit(h.root, "Update beta's next action");
  await h.git("git", ["switch", "main"]);
  const pointer = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("epsilon"),
    placement: { kind: "backlog", commitment: "planned", cohort: [] } });
  await mkdir(dirname(join(h.root, pointer)), { recursive: true });
  await writeFile(join(h.root, pointer), composePointerRecord({ name: "epsilon", branch: "feat/epsilon",
    reason: "Wait for the upstream dependency.", renderFields: { owner: "andrew" } }));
  await h.git("git", ["add", ".arc"]);
  await commit(h.root, "Park epsilon");
  await h.git("git", ["push", "--set-upstream", "origin", "main"]);
  const exclude = resolve(h.root, (await h.git("git", ["rev-parse", "--git-path", "info/exclude"])).stdout);
  await mkdir(dirname(exclude), { recursive: true });
  await appendFile(exclude, "\n/.arc-fixture/\n");
  await ensureWorktreeMarkerIgnored(h.root, h.git, nodeWorktreeMarkerIgnoreFs);
  for (const slug of ["delta", "zeta"]) {
    const worktree = join(dirname(h.root), `${basename(h.root)}-${slug}`);
    const branch = `feat/${slug}`;
    onTestFinished(() => rm(worktree, { recursive: true, force: true }));
    await h.git("git", ["worktree", "add", "-b", branch, worktree, "main"]);
    await addMeta(h, worktree, slug, branch);
    await writeWorktreeMarker(worktree, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: FIXTURE_DATE,
      createdFor: { kind: "work-unit", name: slug } });
    await h.git("git", ["worktree", "lock", "--reason", PROJECTION_LOCK_REASON, worktree]);
    await h.git("git", ["push", "--set-upstream", "origin", branch]);
  }
  await h.git("git", ["fetch", "origin"]);
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
    expect({ missed: listed.missed, diagnostics: listed.diagnostics }, `${definition.id} listing`).toEqual({ missed: false, diagnostics: [] });
    records.push(...listed.records);
  }
  const owners = new Map<string, string>();
  for (const { reference: { owner } } of records) if ("uid" in owner && owner.uid !== undefined) owners.set(owner.uid, `${owner.type}:${owner.name}`);
  const mask = (text: string) => [...owners].reduce((masked, [uid, owner]) => masked.replaceAll(uid, `<${owner}>`), text);
  const entries = new Map<string, unknown>();
  for (const { reference, placement, content, links, fields } of records) {
    const key = mask(canonicalize({ kind: reference.kind, owner: `${reference.owner.type}:${reference.owner.name}`,
      key: reference.key ?? null, placement: placement ?? null }));
    expect(entries.has(key), `Duplicate imported record ${key}`).toBe(false);
    entries.set(key, JSON.parse(mask(JSON.stringify({ content, links: links ?? null, fields: fields ?? null }))));
  }
  return Object.fromEntries(entries);
}

async function expectEligibleSources(h: Fixture): Promise<void> {
  const older = "refs/remotes/origin/feat/beta", newer = "refs/heads/feat/beta";
  const distance = await h.git("git", ["rev-list", "--left-right", "--count", `${older}...${newer}`]);
  expect.soft(distance.stdout, "Beta's fetched copy is a strict ancestor of its local copy").toMatch(/^0\s+[1-9]\d*$/u);
  const changes = await h.git("git", ["diff", "--name-only", older, newer, "--", BETA_META]);
  expect.soft(changes.stdout, "Beta's local copy contains a committed meta edit").toBe(BETA_META);

  const io = { repo: h.root, exec: h.git };
  const checkouts = await readWindowCheckouts(io);
  const findings = [...windowUnmarkedCheckoutFindings(checkouts), ...windowCheckoutLockFindings(checkouts),
    ...await readWindowCheckoutStatusFindings(io, checkouts),
    ...await readWindowCheckoutUpstreamFindings(io, checkouts)];
  expect.soft(findings).toEqual([]);
}

it("imports the same records whatever order branches, worktrees, and fetched refs are listed in, a parked unit among them", async () => {
  const template = await makeTempRoot("arc-empty-git-template-");
  onTestFinished(() => removeGitBackedDir(template));
  vi.stubEnv("GIT_TEMPLATE_DIR", template);
  onTestFinished(() => { vi.unstubAllEnvs(); });
  const [listed, reordered] = await Promise.all([importFixture("default"), importFixture("default")]);
  await prepare(listed);
  await prepare(reordered);
  await expectEligibleSources(listed);
  const seen = new Set<string>();
  reordered.ports.exec = permuted(reordered.ports.exec, seen);
  expect(await listed.migrate()).toMatchObject({ status: "ok" });
  expect(await reordered.migrate()).toMatchObject({ status: "ok" });
  expect([...seen].sort()).toEqual(["refs", "worktrees"]);
  const expected = await importedRecords(listed);
  expect(Object.keys(expected).filter(key => key.includes("\"work-item/meta\"")).map(key => JSON.parse(key).owner).sort())
    .toEqual(["work-item:alpha", "work-item:beta", "work-item:delta", "work-item:epsilon", "work-item:gamma", "work-item:zeta"]);
  const actual = await importedRecords(reordered);
  expect(actual).toEqual(expected);
  const beta = canonicalize({ kind: "work-item/meta", owner: "work-item:beta", key: null, placement: { kind: "active" } });
  expect.soft(expected[beta]).toMatchObject({ fields: { nextAction: BETA_NEXT_ACTION } });
  expect(actual[beta]).toMatchObject({ fields: { nextAction: BETA_NEXT_ACTION } });
}, 120_000);

it("commits the staged fixture meta when the caller selects an alternate index", async () => {
  const h = await importFixture();
  const indexFile = join(h.root, ".git", "caller-index");
  await h.git("git", ["read-tree", "--empty"], { indexFile });
  vi.stubEnv("GIT_INDEX_FILE", indexFile);
  onTestFinished(() => { vi.unstubAllEnvs(); });

  await addMeta(h, h.root, "beta", "feat/beta");
  expect((await h.git("git", ["ls-tree", "--name-only", "HEAD", "--", BETA_META])).stdout).toBe(BETA_META);
});

it.each(["duplicate", "unreadable"] as const)("rejects an inventory with an extra %s meta", async fault => {
  const h = await importFixture();
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const listMetas = () => createRefStore(h.ports).list({ family: "work-item", kind: "work-item/meta" });
  const before = success(await listMetas());
  if (before.status !== "complete" || before.records.length !== 1) throw new Error("Expected one imported meta");
  const [alpha] = before.records;
  if (!alpha) throw new Error("Missing alpha meta");
  await expect(importedRecords(h)).resolves.toBeDefined();
  const home = expandStoredPath(alpha.reference);
  const uid = "12345678-1234-4234-8234-123456789abc";
  const extraRef = `refs/arc/work/${uid}`;
  const entries = [{ path: home.path, content: alpha.content }];
  if (fault === "duplicate") {
    const metadata = await h.git("git", ["show", `${home.ref}:${home.metadataPath}`]);
    entries.push({ path: `metadata-${uid}.json`, content: metadata.stdout });
  }
  await plantRef(h.root, extraRef, entries);

  const after = success(await listMetas());
  if (fault === "duplicate") {
    expect(after).toMatchObject({ status: "complete", missed: false, records: expect.arrayContaining([
      alpha, expect.objectContaining({ reference: { ...alpha.reference, owner: { ...alpha.reference.owner, uid } }, content: alpha.content }),
    ]) });
  } else {
    expect(after).toMatchObject({ status: "complete", missed: true, records: [alpha],
      diagnostics: [expect.objectContaining({ kind: "unreadable", key: extraRef })] });
  }
  await expect(importedRecords(h), `The comparison accepted an extra ${fault} meta`).rejects.toThrow();
}, 120_000);
