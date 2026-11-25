/** Import leaves machinery behind and refuses sources whose mapping is unavailable. */
import { expect, it } from "vitest";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { importFixture } from "../helpers/store/import-fixture.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { readRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { resolveGitCommonDir } from "../../src/lib/git/exec.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { success } from "../helpers/store/suite-tools.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { inRepoContent } from "../helpers/store/in-repo-fixture.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";

it("lists unmapped review facts, preserves all state, and lands after those facts are removed", async () => {
  const h = await importFixture();
  const publisher = new RepositoryGitCommonStatePublisher(h.git, h.root);
  for (const namespace of ["evidence", "outcomes"] as const) {
    await publisher.update({ root: "review-gate", namespace }, "held.json", () => ({ kind: "write", content: `${namespace} source bytes\n`, result: undefined }));
  }
  const common = await resolveGitCommonDir(h.git, h.root);
  const paths = ["arc/review-gate/evidence/held.json", "arc/review-gate/outcomes/held.json"];
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const trial = await h.migrate(true);
  expect(trial.status).toBe("ok");
  if (trial.status !== "ok") throw new Error("Missing trial report");
  for (const path of paths) expect(trial.result.notices).toEqual(expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining(path), remedy: expect.objectContaining({ text: expect.stringMatching(/mapping/u) }),
  })]));
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  expect(await readRepositoryIdentity(publisher)).toBeNull();
  for (const [index, namespace] of ["evidence", "outcomes"].entries()) {
    expect(await readFile(join(common, paths[index]!), "utf8")).toBe(`${namespace} source bytes\n`);
    await rm(join(common, paths[index]!));
  }
  expect(await h.migrate()).toMatchObject({ status: "ok" });
}, 40_000);

it("names an unavailable entry grammar without minting or landing, then imports with the restored registry", async () => {
  const h = await importFixture();
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const kind = "project-inbox/inbox";
  h.ports.registry = { ...registry, [kind]: { ...registry[kind], entry: undefined } };
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const trial = await h.migrate(true);
  expect(trial.status).toBe("ok");
  if (trial.status !== "ok") throw new Error("Missing trial report");
  expect(trial.result.notices).toEqual(expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining(kind), remedy: expect.objectContaining({ text: expect.stringContaining("entry grammar") }),
  })]));
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  expect(await readRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root))).toBeNull();
  h.ports.registry = registry;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(success(await createRefStore(h.ports).read({ reference: RecordReferenceSchema.parse({ kind,
    owner: { type: "project", name: "project" } }) })).content).toContain("First source entry.");
}, 40_000);

it("excludes machinery, constitution, machine files and counters while carrying tracked review and transition state", async () => {
  const h = await importFixture("default", { completed: true, lineage: true });
  const excluded = [
    ".arc/system/methods/example.md", ".arc/reference/PROJECT-PRD.md",
    ".arc/system/.internal/harness-hooks/example.mjs", ".arc/system/.internal/pristine.json",
    ".arc/system/.internal/schemas/example.json",
  ];
  const common = await resolveGitCommonDir(h.git, h.root);
  const marker = ".arc/system/.internal/worktree-marker.json";
  const ignored = [marker, ".arc/system/.internal/pristine.json", ".arc/system/.internal/schemas/"];
  await appendFile(join(common, "info/exclude"), `\n${ignored.join("\n")}\n`);
  for (const path of excluded) {
    await mkdir(dirname(join(h.root, path)), { recursive: true });
    await writeFile(join(h.root, path), `Excluded source ${path}\n`);
  }
  const boundaryRef = RecordReferenceSchema.parse({ kind: "review/integration-boundary", owner: { type: "work-item", name: "alpha" } });
  const boundary = resolveArcPath({ kind: "integration-boundary-record", slug: SlugSchema.parse("alpha") });
  await mkdir(dirname(join(h.root, boundary)), { recursive: true });
  await writeFile(join(h.root, boundary), inRepoContent(boundaryRef));
  await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Prepare machinery exclusions and tracked boundary"]);
  await h.git("git", ["update-ref", "refs/heads/feat/alpha", (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()]);
  await writeWorktreeOwnershipMarker(h.root, { createdByArc: true, createdFor: { kind: "work-unit", name: "alpha" }, spawningIdentity: "andrew", now: 0 });
  expect((await h.git("git", ["check-ignore", marker, excluded[3]!, excluded[4]!])).stdout.trim().split("\n")).toEqual([marker, excluded[3], excluded[4]]);
  const excludedBytes = await Promise.all([...excluded, marker].map(path => readFile(join(h.root, path), "utf8")));
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  expect(success(await store.read({ reference: boundaryRef })).content).toBe(inRepoContent(boundaryRef));
  expect(success(await store.list({ family: "review", kind: "review/candidate" }))).toMatchObject({ status: "complete", records: expect.arrayContaining([expect.objectContaining({ reference: expect.objectContaining({ kind: "review/candidate", owner: expect.objectContaining({ name: "alpha" }) }) })]) });
  expect(success(await store.list({ family: "lineage", kind: "lineage/transition" }))).toMatchObject({ status: "complete", records: expect.arrayContaining([expect.objectContaining({ reference: expect.objectContaining({ kind: "lineage/transition" }) })]) });
  expect(success(await store.list({ family: "project-registry", kind: "project-registry/counter" }))).toMatchObject({ status: "absent" });
  const refs = (await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
  const contents: string[] = [];
  for (const ref of refs) {
    const paths = (await h.git("git", ["ls-tree", "-r", "--name-only", ref])).stdout.trim().split("\n").filter(Boolean);
    expect(paths.some(path => path.startsWith("counters/"))).toBe(false);
    for (const path of paths) contents.push((await h.git("git", ["show", `${ref}:${path}`])).stdout);
  }
  expect(excludedBytes.filter(bytes => contents.includes(bytes))).toEqual([]);
  expect(contents.some(content => content.includes('"spawnedByArc"'))).toBe(false);
}, 40_000);

it("keeps an unreadable review inventory actionable and imports after access is restored", async () => {
  const h = await importFixture();
  const fs = h.ports.fs;
  h.ports.fs = { ...fs, readdir: async path => {
    if (path.endsWith("arc/review-gate")) throw Object.assign(new Error("Review files inaccessible"), { code: "EACCES" });
    return fs.readdir(path);
  } };
  const trial = await h.migrate(true);
  expect(trial).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining("Review files inaccessible"), remedy: { text: expect.stringContaining("Restore access") },
  })]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(await readRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root))).toBeNull();
  h.ports.fs = fs;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
}, 40_000);
