/** Review mapping consumes opaque legacy sources and determines imported review records. */
import { expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { importFixture } from "../helpers/store/import-fixture.js";
import { resolveGitCommonDir } from "../../src/lib/git/exec.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { ArchiveQuarterSchema, ArchiveSequenceSchema } from "../../src/lib/kernel/index.js";
import { createStore, createDefaultStorePorts, createRefStore, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";
import { inRepoContent } from "../helpers/store/in-repo-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { resolveCandidateRecordRelativePath } from "../../src/lib/work-unit/candidate-record-store.js";
import type { ReviewMappingInput, ReviewMappingResult } from "../../src/lib/store/ports.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { readRepositoryIdentity, resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { TransientIdentityRecordSchema, serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { hashBlob, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

function listing(input: ReviewMappingInput, records: RecordReference[]): ReviewMappingResult["listing"] {
  return [
    ...input.gate.map(file => ({ source: file.path, outcome: "mapped" as const, records })),
    ...input.candidates.flatMap(candidate => {
      const owner = input.workItems.find(item => item.uid === candidate.workItem);
      if (!owner) throw new Error("No work item for review source");
      return [
        ...(typeof candidate.current === "string" ? [{ source: resolveCandidateRecordRelativePath(owner.slug), outcome: "mapped" as const, records }] : []),
        ...candidate.versions.map(version => ({ source: `${resolveCandidateRecordRelativePath(owner.slug)}@${version.commit}`, outcome: "mapped" as const, records })),
        ...(candidate.boundary === null ? [] : [{ source: resolveArcPath({ kind: "integration-boundary-record", slug: SlugSchema.parse(owner.slug) }), outcome: "mapped" as const, records }]),
      ];
    }),
  ];
}

function tableMapping(input: ReviewMappingInput): ReviewMappingResult {
  const records = input.candidates.map(candidate => {
    const item = input.workItems.find(item => item.uid === candidate.workItem)!;
    return { reference: RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: item.slug, uid: item.uid } }),
      contents: [JSON.stringify({ projectId: input.projectId, workItems: input.workItems })] };
  });
  return { records, listing: listing(input, records.map(record => record.reference)) };
}

it("uses a mapping's records after supplying exact gate bytes and the live Candidate history and boundary", async () => {
  const h = await importFixture();
  const reference = RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } });
  const boundaryRef = RecordReferenceSchema.parse({ ...reference, kind: "review/integration-boundary" });
  const boundary = resolveArcPath({ kind: "integration-boundary-record", slug: SlugSchema.parse("alpha") });
  await writeFile(join(h.root, resolveCandidateRecordRelativePath("alpha")), inRepoContent(reference, "changed"));
  await mkdir(dirname(join(h.root, boundary)), { recursive: true });
  await writeFile(join(h.root, boundary), inRepoContent(boundaryRef));
  await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Prepare review boundary"]);
  await h.git("git", ["update-ref", "refs/heads/feat/alpha", (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()]);
  const common = await resolveGitCommonDir(h.git, h.root);
  const gate = [
    { path: "arc/review-gate/.quarantine/evidence.bin", bytes: [0, 255, 128, 65] },
    { path: "arc/review-gate/retired/old.json", bytes: [123, 125] },
    { path: "arc/review-gate/sources/work/payload", bytes: [10, 13, 0, 200] },
  ];
  for (const file of gate) {
    await mkdir(dirname(join(common, file.path)), { recursive: true });
    await writeFile(join(common, file.path), new Uint8Array(file.bytes));
  }
  h.ports.reviewMapping = (input: ReviewMappingInput) => {
    const owner = input.workItems.find(item => item.slug === "alpha");
    if (!owner) throw new Error("Mapping received no alpha identity");
    const mapped = RecordReferenceSchema.parse({ ...reference, owner: { type: "work-item", name: "alpha", uid: owner.uid } });
    return {
      records: [{ reference: mapped, contents: [JSON.stringify({
        projectId: input.projectId, gate: input.gate.map(file => ({ path: file.path, bytes: [...file.bytes] })),
        candidates: input.candidates, workItems: input.workItems,
      })] }],
      listing: listing(input, [mapped]),
    };
  };
  const migrated = await h.migrate();
  expect(migrated.status, JSON.stringify(migrated)).toBe("ok");
  const store = createRefStore(h.ports);
  const record = success(await store.read({ reference }));
  if (record.reference.owner.type !== "work-item") throw new Error("Mapped record has no work item");
  const mapped = JSON.parse(record.content);
  expect(mapped.gate).toEqual(gate);
  expect(mapped.workItems).toEqual([{ slug: "alpha", kind: "work-unit", uid: record.reference.owner.uid, live: true }]);
  const commits = (await h.git("git", ["log", "--format=%H", "--", resolveCandidateRecordRelativePath("alpha")])).stdout.trim().split("\n").reverse();
  const versions = await Promise.all(commits.map(async commit => ({ commit, content: (await h.git("git", ["show", `${commit}:${resolveCandidateRecordRelativePath("alpha")}`])).stdout })));
  expect(mapped.candidates).toEqual([{ workItem: record.reference.owner.uid, boundary: inRepoContent(boundaryRef),
    current: inRepoContent(reference, "changed"), versions }]);
  const identity = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }) }));
  expect(mapped.projectId).toBe(JSON.parse(identity.content).projectId);
  expect(await store.read({ reference: boundaryRef })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  if (migrated.status === "ok") expect(migrated.result.reviewMapping.map(item => item.source).sort()).toEqual([
    ...gate.map(file => file.path), resolveCandidateRecordRelativePath("alpha"), ...commits.map(commit => `${resolveCandidateRecordRelativePath("alpha")}@${commit}`), boundary,
  ].sort());
}, 40_000);

it.each(["merge", "squash"] as const)("refuses archived work with an unlanded %s branch and succeeds after its safe repair", async repair => {
  const h = await importFixture("default", { completed: true });
  const path = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("archived"), placement: {
    kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3"), sequence: ArchiveSequenceSchema.parse("53"),
  } });
  await writeFile(join(h.root, path), makeMetaFixture("archived", { state: "Shipped", owner: "andrew", branch: "feat/archived",
    completed: "2026-10-01", prUrl: "https://example.test/pull/1" }));
  const archivedBoundary = RecordReferenceSchema.parse({ kind: "review/integration-boundary", owner: { type: "work-item", name: "archived" } });
  const boundaryPath = resolveArcPath({ kind: "integration-boundary-record", slug: SlugSchema.parse("archived") });
  await mkdir(dirname(join(h.root, boundaryPath)), { recursive: true });
  await writeFile(join(h.root, boundaryPath), inRepoContent(archivedBoundary));
  await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Retain archived branch and boundary"]);
  const before = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  if (repair === "merge") await h.git("git", ["update-ref", "refs/remotes/origin/main", before]);
  await h.git("git", ["checkout", "-b", "feat/archived"]);
  for (let index = 1; index <= (repair === "merge" ? 1 : 2); index++) {
    await writeFile(join(h.root, "archived-code.txt"), "Archived code\n".repeat(index));
    await h.git("git", ["add", "archived-code.txt"]);
    await h.git("git", ["commit", "-m", `Archived code ${index}`]);
  }
  await h.git("git", ["checkout", "main"]);
  h.ports.reviewMapping = tableMapping;
  expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining("feat/archived"), remedy: { text: expect.stringMatching(/merge|remove/u) },
  })]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(await readRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root))).toBeNull();
  if (repair === "merge") {
    const exec = h.ports.exec;
    h.ports.exec = async (command, args, options) => {
      if (args.includes("cherry")) throw makeGitProcessError({ command, args, exitCode: 128, stderr: "fatal: archived objects unavailable" });
      return exec(command, args, options);
    };
    expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([expect.objectContaining({
      condition: expect.stringContaining("Cannot prove archived branch"), remedy: { text: expect.stringContaining("Restore local access") },
    })]) } });
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    h.ports.exec = exec;
    await h.git("git", ["merge", "--ff-only", "feat/archived"]);
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    await h.git("git", ["update-ref", "refs/remotes/origin/main", (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()]);
  } else {
    await h.git("git", ["merge", "--squash", "feat/archived"]);
    await h.git("git", ["commit", "-m", "Squash archived changes"]);
    expect((await h.git("git", ["cherry", "main", "feat/archived"])).stdout.trim().split("\n").every(line => line.startsWith("+ "))).toBe(true);
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    await h.git("git", ["branch", "-D", "feat/archived"]);
  }
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  expect(success(await store.read({ reference: archivedBoundary })).content).toBe(inRepoContent(archivedBoundary));
  const archivedCandidate = RecordReferenceSchema.parse({ ...archivedBoundary, kind: "review/candidate" });
  expect(JSON.parse(success(await store.read({ reference: archivedCandidate })).content))
    .toEqual(JSON.parse(await readFile(join(h.root, resolveCandidateRecordRelativePath("archived")), "utf8")));
  const alpha = success(await store.read({ reference: RecordReferenceSchema.parse({ ...archivedCandidate, owner: { type: "work-item", name: "alpha" } }) }));
  expect(JSON.parse(alpha.content).workItems).toEqual(expect.arrayContaining([expect.objectContaining({ slug: "archived", live: false })]));
}, 60_000);

it("classifies every held work item and preserves completed review records as found", async () => {
  const h = await importFixture("default", { completed: true, lineage: true });
  await writeFile(join(h.root, ".arc/active/meta-merged.md"), makeMetaFixture("merged", { owner: "andrew", branch: "feat/merged" }));
  await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Prepare merged active work"]);
  await h.git("git", ["branch", "feat/merged"]);
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const io = { exec: h.ports.exec, execInput: h.ports.execInput, identity: "andrew" };
  const entries = new Map<string, string>();
  for (const [index, state] of (["open", "paused", "awaiting-merge"] as const).entries()) {
    const slug = `errand-${state}`, branch = `chore/${slug}`;
    await h.git("git", ["branch", branch]);
    const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug, branch,
      claimId: String(index + 1).repeat(32), createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
      intent: "Preserve this work", origin: "description", originEntry: null,
      ...(state === "open" ? { state, savedHead: null, changeRequest: null } : state === "paused" ? { state, savedHead: head, changeRequest: null }
        : { state, savedHead: null, changeRequest: { repositoryRef: "example/repo", hostRef: "github", baseRef: "main", headSha: head, headRef: branch } }),
    });
    entries.set(slug, await hashBlob(io.execInput, serializeTransientIdentityRecord(record)));
  }
  await writeTreeCommit(io, entries, "Prepare live transient states", [], null);
  const facts = [
    { claimId: "9".repeat(32), slug: "errand-open", content: "Ended predecessor review" },
    { claimId: "1".repeat(32), slug: "errand-open", content: "Current claim review" },
  ];
  const common = await resolveGitCommonDir(h.git, h.root);
  for (const fact of facts) {
    const path = join(common, "arc/review-gate/evidence", `${fact.claimId}.json`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(fact));
  }
  h.ports.reviewMapping = input => {
    const mapped = tableMapping(input);
    for (const file of input.gate) {
      const fact: typeof facts[number] = JSON.parse(new TextDecoder().decode(file.bytes));
      const owner = input.workItems.find(item => item.kind === "errand" && item.claimId === fact.claimId);
      const index = mapped.listing.findIndex(item => item.source === file.path);
      if (!owner) mapped.listing[index] = { source: file.path, outcome: "left-behind", reason: "Ended claim", records: [] };
      else {
        const reference = RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: owner.slug, uid: owner.uid } });
        mapped.records.push({ reference, contents: [JSON.stringify(fact)] });
        mapped.listing[index] = { source: file.path, outcome: "mapped", records: [reference] };
      }
    }
    return mapped;
  };
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  const alpha = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } }) }));
  const table: ReviewMappingInput["workItems"] = JSON.parse(alpha.content).workItems;
  expect(table.map(({ slug, kind, live }) => ({ slug, kind, live })).sort((a, b) => a.slug.localeCompare(b.slug))).toEqual([
    ...["alpha", "branch-only", "merged"].map(slug => ({ slug, kind: "work-unit", live: true })),
    ...["archived", "also-archived", "last-archived", "abandoned", "cut-origin"].map(slug => ({ slug, kind: "work-unit", live: false })),
    ...["open", "paused", "awaiting-merge"].map(state => ({ slug: `errand-${state}`, kind: "errand", live: true })),
  ].sort((a, b) => a.slug.localeCompare(b.slug)));
  expect(new Set(table.map(item => item.uid)).size).toBe(table.length);
  const errandReview = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "errand-open" } }) }));
  expect(JSON.parse(errandReview.content)).toEqual(facts[1]);
  expect(errandReview.reference.owner).toMatchObject({ uid: table.find(item => item.slug === "errand-open")?.uid });
  for (const item of table) {
    const kind = item.kind === "errand" ? "work-item/record" : ["abandoned", "cut-origin"].includes(item.slug) ? "lineage/transition" : "work-item/meta";
    const record = success(await store.read({ reference: RecordReferenceSchema.parse({ kind, owner: { type: "work-item", name: item.slug } }) }));
    expect(record.reference.owner).toMatchObject({ uid: item.uid });
    if (item.kind === "errand") expect(JSON.parse(record.content).claimId).toBe(item.claimId);
  }
}, 60_000);

it("reports in-flight mappings without landing and succeeds once review has finished", async () => {
  const h = await importFixture();
  let inFlight = true;
  h.ports.reviewMapping = input => {
    const mapped = tableMapping(input);
    if (inFlight) mapped.listing[0] = { ...mapped.listing[0]!, outcome: "in-flight", reason: "The source review is active" };
    return mapped;
  };
  expect(await h.migrate(true)).toMatchObject({ status: "ok", result: { reviewMapping: expect.arrayContaining([expect.objectContaining({ outcome: "in-flight", reason: "The source review is active" })]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(await readRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root))).toBeNull();
  inFlight = false;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
}, 40_000);

it("accounts for gate files and separate Candidate versions without omissions, repetitions, or invented sources", async () => {
  const h = await importFixture();
  const gatePath = "arc/review-gate/evidence/held.json";
  const common = await resolveGitCommonDir(h.git, h.root);
  await mkdir(dirname(join(common, gatePath)), { recursive: true });
  await writeFile(join(common, gatePath), "Opaque source bytes");
  const candidatePath = resolveCandidateRecordRelativePath("alpha");
  const first = (await h.git("git", ["log", "--format=%H", "--", candidatePath])).stdout.trim();
  await writeFile(join(h.root, candidatePath), inRepoContent(RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } }), "changed"));
  await h.git("git", ["add", candidatePath]);
  await h.git("git", ["commit", "-m", "Advance Candidate source for coverage"]);
  await h.git("git", ["update-ref", "refs/heads/feat/alpha", (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()]);
  const candidateSource = `${candidatePath}@${first}`;
  const absent = "arc/review-gate/evidence/absent.json";
  let defect: "omit" | "repeat" | "unknown" | null = null, source = "";
  h.ports.reviewMapping = input => {
    const mapped = tableMapping(input);
    const item = mapped.listing.find(item => item.source === source);
    if (defect === "omit") mapped.listing = mapped.listing.filter(item => item.source !== source);
    else if (defect === "repeat") mapped.listing.push(item!);
    else if (defect === "unknown") mapped.listing.push({ source: absent, outcome: "left-behind", reason: "Unused source", records: [] });
    return mapped;
  };
  for (const target of [gatePath, candidateSource, candidatePath]) {
    source = target;
    for (const mode of ["omit", "repeat"] as const) {
      defect = mode;
      expect.soft(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([expect.objectContaining({
        condition: expect.stringContaining(`${source} is covered ${mode === "omit" ? 0 : 2} times`), remedy: { text: expect.stringContaining("exactly once") },
      })]) } });
    }
  }
  defect = "unknown";
  expect.soft(await h.migrate(true)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([expect.objectContaining({ condition: expect.stringContaining(absent) })]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(await readRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root))).toBeNull();
  defect = null;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
}, 60_000);

it.each(["parser", "serialization", "empty"] as const)("refuses a mapping's %s-invalid revisions and lands after the mapping is repaired", async defect => {
  const h = await importFixture();
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  if (defect === "parser") h.ports.registry = { ...registry, "review/candidate": { ...registry["review/candidate"],
    parser: content => JSON.parse(content).allowed === true ? { success: true, data: {} } : { success: false, error: "Mapped record is not allowed" } } };
  let broken = true;
  h.ports.reviewMapping = input => {
    const alpha = input.workItems.find(item => item.slug === "alpha")!;
    const reference = RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: alpha.slug, uid: alpha.uid } });
    const contents = broken && defect === "empty" ? [] : [...(broken ? [defect === "parser" ? '{"allowed":false}' : "invalid\0bytes"] : []), '{"allowed":true}'];
    return { records: [{ reference, contents }],
      listing: listing(input, [reference]) };
  };
  const trial = await h.migrate(true);
  expect(trial).toMatchObject({ status: "ok", result: { refused: [expect.objectContaining({ rule: "review-mapping", reference: expect.objectContaining({ kind: "review/candidate" }) })],
    notices: expect.arrayContaining([expect.objectContaining({ remedy: { text: expect.stringContaining("mapping") } })]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(await readRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root))).toBeNull();
  broken = false;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const reference = RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } });
  expect(success(await createRefStore(h.ports).read({ reference })).content).toBe('{"allowed":true}');
}, 40_000);

it("rebuilds the mapping against a concurrently established repository identity before any ref lands", async () => {
  const h = await importFixture();
  const publisher = new RepositoryGitCommonStatePublisher(h.git, h.root);
  const projectId = "34567890-1234-4234-8234-123456789abc";
  let establish = true;
  h.ports.migrateStep = async step => {
    if (step === "import.build" && establish) {
      establish = false;
      await resolveRepositoryIdentity(publisher, () => projectId);
    }
  };
  h.ports.reviewMapping = tableMapping;
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused", report: {
    notices: expect.arrayContaining([expect.objectContaining({ condition: expect.stringContaining("identity changed"),
      remedy: { text: expect.stringContaining("Retry") } })]),
  } } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(await readRepositoryIdentity(publisher)).toBe(projectId);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const record = success(await createRefStore(h.ports).read({ reference: RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } }) }));
  expect(JSON.parse(record.content).projectId).toBe(projectId);
}, 40_000);

it("replays each returned review revision in its own batch before the shared current-files landing", async () => {
  const h = await importFixture();
  const candidateContents = ['{"mapped":"older"}', '{"mapped":"newer"}'];
  const boundaryContent = '{"mapped":"boundary"}';
  h.ports.reviewMapping = input => {
    const alpha = input.workItems.find(item => item.slug === "alpha")!;
    const owner = { type: "work-item", name: alpha.slug, uid: alpha.uid };
    const candidate = RecordReferenceSchema.parse({ kind: "review/candidate", owner });
    const boundary = RecordReferenceSchema.parse({ kind: "review/integration-boundary", owner });
    return { records: [{ reference: candidate, contents: candidateContents }, { reference: boundary, contents: [boundaryContent] }],
      listing: listing(input, [candidate, boundary]) };
  };
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  const batches: string[] = [];
  for (const [kind, expected] of [["review/candidate", candidateContents], ["review/integration-boundary", [boundaryContent]]] as const) {
    const record = success(await store.read({ reference: RecordReferenceSchema.parse({ kind, owner: { type: "work-item", name: "alpha" } }) }));
    expect(record.content).toBe(expected.at(-1));
    const home = expandStoredPath(record.reference);
    const commits = (await h.git("git", ["log", "--reverse", "--format=%H", home.ref, "--", home.path])).stdout.trim().split("\n");
    const contents = [];
    for (const commit of commits) {
      contents.push((await h.git("git", ["show", `${commit}:${home.path}`])).stdout);
      batches.push((await h.git("git", ["show", "-s", "--format=%B", commit])).stdout.match(/^Arc-Batch: (.+)$/mu)![1]!);
    }
    expect(contents).toEqual(expected);
    const landing = (await h.git("git", ["show", "-s", "--format=%B", home.ref])).stdout.match(/^Arc-Batch: (.+)$/mu)![1]!;
    expect(batches).not.toContain(landing);
  }
  expect(new Set(batches).size).toBe(3);
}, 40_000);

it("preserves a newer uncommitted Candidate separately from its committed history", async () => {
  const h = await importFixture();
  await h.git("git", ["checkout", "feat/alpha"]);
  const reference = RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } });
  const path = resolveCandidateRecordRelativePath("alpha");
  const current = inRepoContent(reference, "changed");
  await writeFile(join(h.root, path), current);
  const native = createStore(createDefaultStorePorts({ checkoutRoot: h.root }));
  expect(success(await native.read({ reference })).content).toBe(current);
  const notes = "# Notes: Alpha\n\nUncommitted continuity marker.\n";
  await writeFile(join(h.root, ".arc/active/notes-alpha.md"), notes);
  h.ports.reviewMapping = input => {
    const owner = input.workItems.find(item => item.slug === "alpha")!;
    const mapped = RecordReferenceSchema.parse({ ...reference, owner: { type: "work-item", name: owner.slug, uid: owner.uid } });
    return { records: [{ reference: mapped, contents: [JSON.stringify(input.candidates)] }], listing: listing(input, [mapped]) };
  };
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  const after = success(await store.read({ reference }));
  const candidates: ReviewMappingInput["candidates"] = JSON.parse(after.content);
  expect(candidates).toHaveLength(1);
  expect(candidates[0]?.current).toBe(current);
  expect(candidates[0]?.versions).toHaveLength(1);
  expect(candidates[0]?.versions.every(version => version.content !== current)).toBe(true);
  expect(success(await store.read({ reference: RecordReferenceSchema.parse({ ...reference, kind: "work-item/notes" }) })).content).toBe(notes);
}, 40_000);

it("supplies null current content for live work holding only a boundary", async () => {
  const h = await importFixture();
  await h.git("git", ["checkout", "feat/alpha"]);
  const reference = RecordReferenceSchema.parse({ kind: "review/integration-boundary", owner: { type: "work-item", name: "alpha" } });
  const boundary = resolveArcPath({ kind: "integration-boundary-record", slug: SlugSchema.parse("alpha") });
  await mkdir(dirname(join(h.root, boundary)), { recursive: true });
  await writeFile(join(h.root, boundary), inRepoContent(reference));
  await h.git("git", ["rm", resolveCandidateRecordRelativePath("alpha")]);
  h.ports.reviewMapping = input => {
    const owner = input.workItems.find(item => item.slug === "alpha")!;
    const mapped = RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: owner.slug, uid: owner.uid } });
    return { records: [{ reference: mapped, contents: [JSON.stringify(input.candidates)] }], listing: listing(input, [mapped]) };
  };
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const record = success(await createRefStore(h.ports).read({ reference: RecordReferenceSchema.parse({ ...reference, kind: "review/candidate" }) }));
  expect(JSON.parse(record.content)).toEqual([{ workItem: record.reference.owner.type === "work-item" ? record.reference.owner.uid : undefined,
    versions: [], current: null, boundary: inRepoContent(reference) }]);
}, 40_000);

it("accounts for materialization folders once and refuses overlapping or noncanonical coverage through repair", async () => {
  const h = await importFixture();
  const folder = "arc/review-gate/materializations/work/";
  const files = [`${folder}source.json`, `${folder}nested/payload.bin`];
  const common = await resolveGitCommonDir(h.git, h.root);
  for (const path of files) {
    await mkdir(dirname(join(common, path)), { recursive: true });
    await writeFile(join(common, path), new Uint8Array([0, 255, 128]));
  }
  let mode = "valid";
  h.ports.reviewMapping = input => {
    const mapped = tableMapping(input);
    mapped.listing = mapped.listing.filter(item => !files.includes(item.source));
    const entry = { source: folder, outcome: "left-behind" as const, reason: "Working materialization", records: [] };
    if (mode !== "omit") mapped.listing.push(entry);
    if (mode === "repeat") mapped.listing.push(entry);
    if (mode === "file-overlap") mapped.listing.push({ ...entry, source: files[0]! });
    if (mode === "nested-overlap") mapped.listing.push({ ...entry, source: `${folder}nested/` });
    if (mode === "noncanonical") entry.source = folder.replace("work/", "work//");
    if (mode === "reason-missing") entry.reason = " ";
    if (mode === "mapped-folder") mapped.listing[mapped.listing.length - 1] = { ...entry, outcome: "mapped" };
    return mapped;
  };
  const trial = await h.migrate(true);
  expect.soft(trial).toMatchObject({ status: "ok", result: { notices: [expect.objectContaining({ condition: "The landing would mint the repository identity ID." })] } });
  if (trial.status === "ok") expect.soft(trial.result.reviewMapping.filter(item => item.source.startsWith(folder))).toEqual([
    { source: folder, outcome: "left-behind", reason: "Working materialization", records: [] },
  ]);
  for (mode of ["omit", "repeat", "file-overlap", "nested-overlap", "noncanonical", "reason-missing", "mapped-folder"]) {
    const result = await h.migrate(true);
    expect.soft(result).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([expect.objectContaining({
      condition: expect.stringContaining("Review"), remedy: { text: expect.stringContaining("mapping") },
    })]) } });
  }
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(await readRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root))).toBeNull();
  mode = "valid";
  expect(await h.migrate()).toMatchObject({ status: "ok" });
}, 60_000);

it.each(["unknown-owner", "unparsable"] as const)("refuses a mapping record with an %s reference and lands after the mapping is repaired", async defect => {
  const h = await importFixture();
  let broken = true;
  h.ports.reviewMapping = input => {
    const alpha = input.workItems.find(item => item.slug === "alpha")!;
    const reference = RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: alpha.slug, uid: alpha.uid } });
    const stray = defect === "unknown-owner"
      ? RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "stray", uid: "01234567-89ab-4def-8123-456789abcdef" } })
      : { kind: "review/candidate", owner: { type: "work-item", name: "Not A Slug" } } as unknown as RecordReference;
    const records = [{ reference, contents: ['{"allowed":true}'] }, ...broken ? [{ reference: stray, contents: ['{"allowed":true}'] }] : []];
    return { records, listing: listing(input, [reference]) };
  };
  const trial = await h.migrate(true);
  expect(trial).toMatchObject({ status: "ok", result: {
    notices: expect.arrayContaining([expect.objectContaining({ condition: expect.stringContaining("Review mapping record"), remedy: { text: expect.stringContaining("mapping") } })]) } });
  if (defect === "unknown-owner") expect(trial).toMatchObject({ result: { refused: [expect.objectContaining({ rule: "review-mapping",
    reference: expect.objectContaining({ owner: expect.objectContaining({ name: "stray" }) }) })] } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  broken = false;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
}, 40_000);
