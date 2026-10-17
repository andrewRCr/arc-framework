/** Import admission and identity handling through the public migration entry. */
import { mkdir, readdir, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, MigrateReportSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { inRepoContent } from "../helpers/store/in-repo-fixture.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { CandidateManagedRecordV1Schema, createCandidateAttestation, serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";
import { importFixture } from "../helpers/store/import-fixture.js";

describe("tracked import entry", () => {
  it.each(["default", "separate"] as const)("reports a %s trial without minting the gate identity or landing state", async (layout) => {
    const h = await importFixture(layout);
    const result = await h.migrate(true);
    expect(result.status, JSON.stringify(result)).toBe("ok");
    if (result.status !== "ok") throw new Error("Trial refused");
    const report = MigrateReportSchema.parse(result.result);
    expect(report.move).toBe("import");
    expect(report.notices.some(({ condition }) => /mint.*(?:identity|ID)/u.test(condition))).toBe(true);
    expect(report.refs.some(({ ref }) => ref.startsWith("refs/arc/work/"))).toBe(true);
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    await expect(readdir(join(h.root, ".git/arc/review-gate"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it.each(["default", "separate"] as const)("lands the selected %s layout under the review gate project ID", async (layout) => {
    const h = await importFixture(layout);
    const id = await resolveRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root));
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    const result = await h.migrate();
    expect(result.status, JSON.stringify(result)).toBe("ok");
    const store = createRefStore(h.ports);
    const identity = success(await store.read({ reference: RecordReferenceSchema.parse({
      kind: "project-registry/identity", owner: { type: "project", name: "project" },
    }) }));
    expect(JSON.parse(identity.content)).toEqual({ projectId: id });
    const meta = success(await store.read({ reference: RecordReferenceSchema.parse({
      kind: "work-item/meta", owner: { type: "work-item", name: "alpha" },
    }) }));
    expect(meta.content).toBe(makeMetaFixture("alpha", { owner: "andrew", branch: "feat/alpha" }));
    expect(meta.reference.owner).toMatchObject({ name: "alpha", uid: expect.any(String) });
    const args = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const messages = (await h.git("git", [...args, "log", "--all", "--format=%B", "--", "identity.json"])).stdout;
    expect(messages).toContain(`Arc-Code-Head: ${head}`);
    const code = (await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout;
    expect(Boolean(code.trim())).toBe(layout === "default");
  });
  it.each(["other-project", "unidentified"] as const)("refuses a store holding %s state before reading import sources", async (state) => {
    const h = await importFixture();
    const id = await resolveRepositoryIdentity(new RepositoryGitCommonStatePublisher(h.git, h.root));
    const store = createRefStore(h.ports);
    const reference = RecordReferenceSchema.parse({ kind: state === "other-project" ? "project-registry/identity" : "work-item/meta",
      owner: { type: state === "other-project" ? "project" : "work-item", name: state === "other-project" ? "project" : "held" } });
    const otherId = "34567890-1234-4234-8234-123456789abc";
    const written = success(await store.write({ action: "put", expected: null, reference,
      content: state === "other-project" ? JSON.stringify({ projectId: otherId }) : makeMetaFixture("held"),
      ...(state === "unidentified" ? { placement: { kind: "active" as const } } : {}), provenance: { verb: "start", lifecycleAction: "seed" } }));
    await writeFile(join(h.root, ".arc/active/meta-alpha.md"), "broken source");
    const stateRefs = async () => (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout.split("\n").filter((line) => !line.startsWith("refs/arc/tmp/"));
    const before = await stateRefs();
    const result = await h.migrate();
    expect(result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
      code: state === "other-project" ? "identity-mismatch" : "version-conflict", remedy: { text: expect.stringMatching(/clone.*(?:empty|no state)/u) },
    } } });
    if (result.status !== "refused" || result.refusal.code !== "store") throw new Error("Expected store refusal");
    const detail = result.refusal.refusal;
    if (state === "other-project") expect(JSON.stringify(detail)).toContain(id);
    if (state === "other-project") expect(JSON.stringify(detail)).toContain(otherId);
    else expect(detail).toMatchObject({ records: expect.arrayContaining([written.reference]) });
    expect(await stateRefs()).toEqual(before);
  });
  it("imports review records from the unmerged revision that supplied the live meta", async () => {
    const h = await importFixture();
    await h.git("git", ["checkout", "feat/alpha"]);
    const reference = RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } });
    const path = resolveArcPath({ kind: "candidate-record", slug: SlugSchema.parse("alpha") });
    const predecessor = CandidateManagedRecordV1Schema.parse(JSON.parse(inRepoContent(reference)));
    await mkdir(dirname(join(h.root, path)), { recursive: true });
    await writeFile(join(h.root, path), serializeCandidateManagedRecord(predecessor));
    await h.git("git", ["add", ".arc"]);
    await h.git("git", ["commit", "-m", "Review only on the work branch"]);
    const current = CandidateManagedRecordV1Schema.parse({ ...predecessor, attestation: createCandidateAttestation({
      workUnit: "alpha", subject: predecessor.subject, baseRevision: "b".repeat(40), attestedBy: "andrew",
      attestedAt: "2026-10-17T12:00:00.000Z", verificationEvidenceRef: "verification://updated",
      supersedes: predecessor.attestation.candidateId,
    }) });
    const content = serializeCandidateManagedRecord(current);
    await writeFile(join(h.root, path), content);
    await h.git("git", ["add", ".arc"]);
    await h.git("git", ["commit", "-m", "Supersede the branch Candidate"]);
    await h.git("git", ["checkout", "main"]);
    await unlink(join(h.root, ".arc/active/meta-alpha.md"));
    await h.git("git", ["add", "-u"]);
    await h.git("git", ["commit", "-m", "Keep active work on its branch"]);
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    const result = await h.migrate();
    expect(result.status, JSON.stringify(result)).toBe("ok");
    if (result.status !== "ok") throw new Error("Branch import refused");
    expect(result.result.brokenChains).toEqual([]);
    const record = success(await createRefStore(h.ports).read({ reference }));
    expect(record.content).toBe(content);
    const home = expandStoredPath(record.reference);
    const messages = (await h.git("git", ["log", home.ref, "--format=%B", "--", home.path])).stdout;
    expect(messages).toContain(`Arc-Code-Head: ${head}`);
  });
  it("carries a schema-rejected legacy Candidate listed only as a malformed diagnostic", async () => {
    const h = await importFixture();
    const reference = RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } });
    const path = resolveArcPath({ kind: "candidate-record", slug: SlugSchema.parse("alpha") });
    const legacy = JSON.parse(inRepoContent(reference)) as Record<string, unknown>;
    legacy.schemaVersion = 99;
    const content = canonicalize(legacy);
    await mkdir(dirname(join(h.root, path)), { recursive: true });
    await writeFile(join(h.root, path), content);
    const result = await h.migrate();
    expect(result.status, JSON.stringify(result)).toBe("ok");
    const primary = success(await createRefStore(h.ports).lookup({ kind: "slug", slug: SlugSchema.parse("alpha") }));
    const home = expandStoredPath({ ...reference, owner: primary.reference.owner });
    expect((await h.git("git", ["show", `${home.ref}:${home.path}`])).stdout).toBe(content);
    expect(success(await createRefStore(h.ports).read({ reference })).content).toBe(content);
  });
});
