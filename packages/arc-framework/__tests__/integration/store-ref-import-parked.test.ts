/** Parked work imports its preserved branch snapshot and explicit pause evidence. */
import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { importFixture, IMPORT_DOCUMENTS } from "../helpers/store/import-fixture.js";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";
import { success } from "../helpers/store/suite-tools.js";
import { createStore, createRefStore, RecordReferenceSchema, StateVersionSchema } from "../../src/lib/store/index.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { composePointerRecord } from "../../src/lib/work-unit/pointer-record.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { MetaPauseSchema } from "../../src/lib/active/meta-schema.js";
import { writeMetaPause } from "../../src/lib/store/kinds/meta/section-writer.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { importCandidatePath } from "../helpers/store/import-candidates.js";
import { CandidateManagedRecordV1Schema, createCandidateAttestation, serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const execFileAsync = promisify(execFile);
const firstPark = "2026-01-02T03:04:05.000Z";
const reason = "Wait for the upstream dependency.";
const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
const workKinds = ["work-item/meta", ...IMPORT_DOCUMENTS.map(([kind]) => kind), "work-item/companion"] as const;
const pointerPath = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("alpha"), placement: { kind: "backlog", commitment: "planned", cohort: [] } });

async function pointerCommit(h: Awaited<ReturnType<typeof importFixture>>, text: string, date: string): Promise<void> {
  await writeFile(join(h.root, pointerPath), composePointerRecord({ name: "alpha", branch: "feat/alpha", reason: text,
    renderFields: { owner: "andrew" } }));
  await h.git("git", ["add", ".arc"]);
  await execFileAsync("git", ["commit", "-m", "Park the work unit"], { cwd: h.root,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
}

async function park(h: Awaited<ReturnType<typeof importFixture>>) {
  await h.git("git", ["switch", "feat/alpha"]);
  const meta = await readFile(join(h.root, ".arc/active/meta-alpha.md"), "utf8");
  await writeFile(join(h.root, ".arc/active/notes-alpha.md"), "# Notes: Alpha\n\nPreserved branch observations.\n");
  await writeFile(join(h.root, ".arc/active/extra-alpha.md"), "# Companion\n\nPreserved branch companion.\n");
  await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Preserve branch work"]);
  const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const tree = StateVersionSchema.parse((await h.git("git", ["rev-parse", "HEAD^{tree}"])).stdout.trim());
  await h.git("git", ["switch", "main"]);
  await h.git("git", ["rm", ".arc/active/meta-alpha.md", ".arc/active/extra-alpha.md", ...IMPORT_DOCUMENTS.map(([, artifact]) => `.arc/active/${artifact}-alpha.md`)]);
  await mkdir(dirname(join(h.root, pointerPath)), { recursive: true });
  await pointerCommit(h, "Original park reason.", firstPark);
  await pointerCommit(h, reason, "2026-02-03T04:05:06.000Z");
  return { meta, tip, tree };
}

describe("parked work in the default layout", () => {
  const layout = "default";
  it("imports the preserved records as Active with the pointer's current reason and first committer time", async () => {
    const facts = new Map<string, Awaited<ReturnType<typeof park>>>();
    const h = await importComparisonFixture(layout, async fixture => { facts.set(fixture.root, await park(fixture)); });
    const pause = MetaPauseSchema.parse({ pausedBy: "andrew", since: firstPark, reason });
    const source = createStore(createDefaultStorePorts({ checkoutRoot: h.source.root }));
    for (const kind of [...workKinds, "review/candidate", "review/integration-boundary"] as const) {
      h.comparators.set(kind, { normalize: async (expected, actual) => {
        const pinned = success(await source.read({ reference: expected.reference, asOf: facts.get(h.source.root)!.tree }));
        const content = kind === "work-item/meta" ? writeMetaPause(pinned.content, pause)
          : kind.startsWith("review/") ? canonicalize(JSON.parse(pinned.content)) : pinned.content;
        return { expected: { ...pinned, content, placement: { kind: "active" },
          ...(kind === "work-item/meta" ? { fields: parseMetaRecord(content) } : {}) }, actual };
      } });
    }
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    const record = success(await h.store.read({ reference }));
    expect(record.placement).toEqual({ kind: "active" });
    expect(parseMetaRecord(record.content)).toMatchObject({ state: "Active", pause });
    expect(record.content).toBe(writeMetaPause(facts.get(h.target.root)!.meta, pause));
    expect(await h.compare()).toEqual([]);
  }, 30_000);
});

it.each((["remote-only", "remote-ahead"] as const).flatMap(state => [{ state, absent: false }, { state, absent: true }]))(
  "pins every parked record and Candidate version to $state work with absent current=$absent", async ({ state, absent }) => {
  const h = await importFixture(), facts = await park(h);
  await h.git("git", ["switch", "feat/alpha"]);
  await writeFile(join(h.root, ".arc/active/notes-alpha.md"), "# Notes: Alpha\n\nNewest remote observations.\n");
  await writeFile(join(h.root, ".arc/active/remote-alpha.md"), "# Remote companion\n\nDiscover this record at the selected tip.\n");
  const candidatePath = join(h.root, importCandidatePath("alpha"));
  const prior = CandidateManagedRecordV1Schema.parse(JSON.parse(await readFile(candidatePath, "utf8")));
  const current = CandidateManagedRecordV1Schema.parse({ ...prior, attestation: createCandidateAttestation({
    workUnit: "alpha", subject: prior.subject, baseRevision: facts.tip, attestedBy: "andrew",
    attestedAt: "2026-10-03T12:00:00.000Z", verificationEvidenceRef: "verification://alpha/remote",
    supersedes: prior.attestation.candidateId,
  }) });
  await writeFile(candidatePath, serializeCandidateManagedRecord(current));
  await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Advance preserved remote work"]);
  if (absent) {
    await h.git("git", ["rm", importCandidatePath("alpha")]);
    await h.git("git", ["commit", "-m", "Remove the parked current Candidate after retaining its versions"]);
  }
  const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const asOf = StateVersionSchema.parse((await h.git("git", ["rev-parse", "HEAD^{tree}"])).stdout.trim());
  await h.git("git", ["switch", "main"]);
  await h.git("git", ["update-ref", "refs/remotes/origin/feat/alpha", tip]);
  if (state === "remote-only") await h.git("git", ["branch", "-D", "feat/alpha"]);
  else await h.git("git", ["update-ref", "refs/heads/feat/alpha", facts.tip]);
  const source = createStore(createDefaultStorePorts({ checkoutRoot: h.root }));
  const records: StoreRecord[] = [];
  for (const kind of workKinds) {
    const listed = success(await source.list({ family: "work-item", kind, owner: reference.owner, asOf }));
    expect(listed.status).toBe("complete");
    if (listed.status !== "complete") throw new Error("No parked source records");
    records.push(...listed.records);
  }
  expect(records.some(record => record.content.includes("Discover this record"))).toBe(true);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports), pause = MetaPauseSchema.parse({ pausedBy: "andrew", since: firstPark, reason });
  for (const before of records) {
    const after = success(await store.read({ reference: before.reference }));
    expect(after.content).toBe(before.reference.kind === "work-item/meta" ? writeMetaPause(before.content, pause) : before.content);
    expect(after.placement).toEqual({ kind: "active" });
  }
  const candidate = RecordReferenceSchema.parse({ ...reference, kind: "review/candidate" });
  if (absent) expect(await store.read({ reference: candidate })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  else expect(JSON.parse(success(await store.read({ reference: candidate })).content)).toEqual(current);
  const history = success(await store.history({ reference: candidate }));
  const ids = history.flatMap(record => record.content === null ? [] : [CandidateManagedRecordV1Schema.parse(JSON.parse(record.content)).attestation.candidateId]);
  expect([...new Set(ids)].sort()).toEqual([prior.attestation.candidateId, current.attestation.candidateId].sort());
}, 30_000);

it.each(["missing", "diverged"] as const)("refuses a %s parked branch and imports after repair", async problem => {
  const h = await importFixture(), facts = await park(h);
  if (problem === "missing") await h.git("git", ["branch", "-D", "feat/alpha"]);
  else {
    await h.git("git", ["switch", "feat/alpha"]);
    await writeFile(join(h.root, "local-work.txt"), "Local branch work\n");
    await h.git("git", ["add", "local-work.txt"]);
    await h.git("git", ["commit", "-m", "Advance local branch"]);
    await h.git("git", ["switch", "-c", "remote-side", facts.tip]);
    await writeFile(join(h.root, "remote-work.txt"), "Remote branch work\n");
    await h.git("git", ["add", "remote-work.txt"]);
    await h.git("git", ["commit", "-m", "Advance remote branch"]);
    const remote = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["update-ref", "refs/remotes/origin/feat/alpha", remote]);
    await h.git("git", ["switch", "main"]);
  }
  const result = await h.migrate(true);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("Import trial did not return a report");
  const trial = result.result;
  expect(trial.refused[0]?.rule).toBe(`branch-${problem}`);
  expect(trial.notices).toEqual(expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining("feat/alpha"), remedy: expect.objectContaining({ text: expect.stringContaining(problem === "missing" ? "Archive" : "Merge") }),
  })]));
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  if (problem === "missing") await h.git("git", ["branch", "feat/alpha", facts.tip]);
  else {
    await h.git("git", ["switch", "feat/alpha"]);
    await h.git("git", ["merge", "--no-edit", "refs/remotes/origin/feat/alpha"]);
    await h.git("git", ["switch", "main"]);
  }
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(parseMetaRecord(success(await createRefStore(h.ports).read({ reference })).content).pause)
    .toEqual(MetaPauseSchema.parse({ pausedBy: "andrew", since: firstPark, reason }));
}, 30_000);

it.each(["empty-reason", "bad-owner", "heading", "separator"] as const)("reports %s as an invalid pause and imports after repair", async problem => {
  const h = await importFixture(), facts = await park(h);
  if (problem === "bad-owner") {
    await h.git("git", ["switch", "feat/alpha"]);
    await writeFile(join(h.root, ".arc/active/meta-alpha.md"), makeMetaFixture("alpha", { owner: "not a slug", branch: "feat/alpha" }));
    await h.git("git", ["add", ".arc"]);
    await h.git("git", ["commit", "-m", "Retain invalid owner evidence"]);
    await h.git("git", ["switch", "main"]);
  } else await pointerCommit(h, problem === "empty-reason" ? "" : problem === "heading" ? "## Invalid reason" : "---", "2026-03-04T05:06:07.000Z");
  const result = await h.migrate(true);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("Import trial did not return a report");
  const trial = result.result;
  expect(trial.refused).toContainEqual({ reference, rule: "pause" });
  expect(trial.notices).toEqual(expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining(problem === "bad-owner" ? "Owner" : "Reason"),
    remedy: expect.objectContaining({ text: expect.stringContaining(problem === "bad-owner" ? "correct" : "Write") }),
  })]));
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  if (problem === "bad-owner") {
    await h.git("git", ["switch", "feat/alpha"]);
    await writeFile(join(h.root, ".arc/active/meta-alpha.md"), facts.meta);
    await h.git("git", ["add", ".arc"]);
    await h.git("git", ["commit", "-m", "Repair owner evidence"]);
    await h.git("git", ["switch", "main"]);
  } else await pointerCommit(h, reason, "2026-04-05T06:07:08.000Z");
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(parseMetaRecord(success(await createRefStore(h.ports).read({ reference })).content).pause)
    .toEqual(MetaPauseSchema.parse({ pausedBy: "andrew", since: firstPark, reason }));
}, 30_000);

it("imports Planning work parked in the backlog as a stub without a pause", async () => {
  const h = await importFixture();
  await mkdir(dirname(join(h.root, pointerPath)), { recursive: true });
  await h.git("git", ["mv", ".arc/active/meta-alpha.md", ".arc/active/extra-alpha.md",
    ...IMPORT_DOCUMENTS.map(([, artifact]) => `.arc/active/${artifact}-alpha.md`), dirname(pointerPath)]);
  const planned = makeMetaFixture("alpha", { state: "Planning", owner: "andrew", branch: null });
  await writeFile(join(h.root, pointerPath), planned);
  await h.git("git", ["rm", importCandidatePath("alpha")]);
  await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Park planning work"]);
  await h.git("git", ["branch", "-D", "feat/alpha"]);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const record = success(await createRefStore(h.ports).read({ reference }));
  expect(record.placement).toEqual({ kind: "backlog", commitment: "planned" });
  expect(record.content).toBe(planned);
  expect(parseMetaRecord(record.content)).toMatchObject({ state: "Planning", pause: null });
}, 30_000);

it("reports a malformed record of a work unit whose slug ends in a parked slug and imports after repair", async () => {
  const h = await importFixture();
  await park(h);
  await mkdir(join(h.root, ".arc/active"), { recursive: true });
  await writeFile(join(h.root, ".arc/active/meta-beta-alpha.md"), "# Not a meta record\n");
  await h.git("git", ["add", ".arc"]);
  await h.git("git", ["commit", "-m", "Add a malformed suffix-sharing meta"]);
  const result = await h.migrate(true);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("Import trial did not return a report");
  expect(result.result.notices).toEqual(expect.arrayContaining([expect.objectContaining({ condition: expect.stringContaining("meta-beta-alpha.md") })]));
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  await h.git("git", ["rm", ".arc/active/meta-beta-alpha.md"]);
  await h.git("git", ["commit", "-m", "Remove the malformed meta"]);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
}, 30_000);

it("dates a pause from the standing pointer after a park, resume, and park again", async () => {
  const h = await importFixture();
  await park(h);
  await h.git("git", ["rm", pointerPath]);
  await h.git("git", ["commit", "-m", "Resume the work unit"]);
  const repark = "2026-05-06T07:08:09.000Z";
  await mkdir(dirname(join(h.root, pointerPath)), { recursive: true });
  await pointerCommit(h, reason, repark);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(parseMetaRecord(success(await createRefStore(h.ports).read({ reference })).content).pause)
    .toEqual(MetaPauseSchema.parse({ pausedBy: "andrew", since: repark, reason }));
}, 30_000);
