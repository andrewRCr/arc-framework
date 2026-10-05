/** Canonical writer validation is observable before compare-and-swap and filesystem changes. */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedWriteFixture, candidateFixture, boundaryFixture, trackedDigest } from "../helpers/store/tracked-write-fixture.js";
import { RecordVersionSchema } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";
import { ArcError } from "../../src/lib/kernel/errors.js";
import { serializeTransitionRecord } from "../../src/lib/work-unit/transition-record.js";
import { CanonicalDigestSchema } from "../../src/lib/kernel/schema/vocabulary.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { createStandardReviewReservation, projectPublicationBoundary, parseIntegrationBoundaryLocus } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { writeSubmissionBoundary } from "../../src/lib/work-unit/submission-boundary-store.js";
import { writeCandidateRecord } from "../../src/lib/work-unit/candidate-record-store.js";
import { writeTransitionRecord } from "../../src/lib/work-unit/transition-record-store.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "edit", lifecycleAction: "edit" };
async function exists(path: string) { return access(path).then(() => true, () => false); }

describe("canonical tracked writer inputs", () => {
  it("refuses schema-invalid Candidate input before a stale version check and lands corrected content", async () => {
    const h = await trackedWriteFixture();
    const reference = h.reference("review/candidate");
    const path = join(h.root, resolveArcPath({ kind: "candidate-record", slug: reference.owner.name }));
    const write = { action: "put" as const, reference, content: JSON.stringify({ schemaVersion: 1 }), expected: RecordVersionSchema.parse("stale"), provenance };
    expect(await h.store.write(write)).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", reference, rule: expect.any(String), remedy: { text: expect.any(String) },
    } });
    expect(await exists(path)).toBe(false);
    const content = JSON.stringify(candidateFixture());
    const landed = success(await h.store.write({ ...write, content, expected: null }));
    expect(await readFile(path, "utf8")).toBe(serializeCandidateManagedRecord(candidateFixture()));
    expect(landed.version).toBe(trackedDigest(await readFile(path, "utf8")));
  });

  for (const kind of ["review/candidate", "review/integration-boundary", "lineage/transition"] as const) {
    it(`refuses ${kind}'s mismatched owner before touching either name and lands corrected content`, async () => {
      const h = await trackedWriteFixture();
      const reference = h.reference(kind);
      const make = (name: string) => kind === "review/candidate" ? candidateFixture(name)
        : kind === "review/integration-boundary" ? boundaryFixture(name)
          : { schemaVersion: 1, origin: name, kind: "abandon", successors: [], edges: [] };
      const address = kind === "review/candidate" ? { kind: "candidate-record" as const, slug: reference.owner.name }
        : kind === "review/integration-boundary" ? { kind: "integration-boundary-record" as const, slug: reference.owner.name }
          : { kind: "transition-record" as const, origin: reference.owner.name };
      const ownPath = join(h.root, resolveArcPath(address));
      const otherPath = join(h.root, resolveArcPath({ ...address, ...(kind === "lineage/transition" ? { origin: SlugSchema.parse("other") } : { slug: SlugSchema.parse("other") }) }));
      const input = { action: "put" as const, reference, content: JSON.stringify(make("other")), expected: null, provenance };
      expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "identity-mismatch", expected: reference,
        actual: { owner: { name: "other" }, kind } } });
      expect(await exists(ownPath)).toBe(false);
      expect(await exists(otherPath)).toBe(false);
      const valid = make("example");
      const landed = success(await h.store.write({ ...input, content: JSON.stringify(valid) }));
      const bytes = await readFile(ownPath, "utf8");
      expect(landed.version).toBe(trackedDigest(bytes));
      if (kind === "review/integration-boundary") expect(bytes).toBe(canonicalize(parseIntegrationBoundaryLocus(valid)));
      if (kind === "lineage/transition") expect(bytes).toBe(serializeTransitionRecord({ schemaVersion: 1, origin: "example", kind: "abandon", successors: [], edges: [] }));
    });
  }

  it("throws the existing store's invalid stored Candidate failure instead of returning a caller-content refusal", async () => {
    const h = await trackedWriteFixture();
    const reference = h.reference("review/candidate");
    const path = join(h.root, resolveArcPath({ kind: "candidate-record", slug: reference.owner.name }));
    const stored = serializeCandidateManagedRecord(candidateFixture("other"));
    await mkdir(join(h.root, ".arc/system/.internal/candidates"), { recursive: true });
    await writeFile(path, stored);
    await expect(h.store.write({ action: "put", reference, content: JSON.stringify(candidateFixture()),
      expected: trackedDigest(stored), provenance })).rejects.toBeInstanceOf(ArcError);
    expect(await readFile(path, "utf8")).toBe(stored);
  });

  it("admits one racing transition creation, refuses the other by reference, and permits rollback then recreation", async () => {
    const h = await trackedWriteFixture();
    const reference = h.reference("lineage/transition");
    const content = JSON.stringify({ schemaVersion: 1, origin: "example", kind: "abandon", successors: [], edges: [] });
    const input = { action: "put" as const, reference, content, expected: null, provenance };
    const results = await Promise.all([h.store.write(input), h.store.write(input)]);
    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(results.find((result) => result.status === "refused")).toMatchObject({ refusal: { code: "version-conflict", records: [reference] } });
    const path = join(h.root, resolveArcPath({ kind: "transition-record", origin: reference.owner.name }));
    const bytes = await readFile(path, "utf8");
    const version = trackedDigest(bytes);
    expect(await h.store.write({ ...input, expected: version })).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [reference] } });
    success(await h.store.write({ action: "remove", reference, expected: version, provenance }));
    expect(await exists(path)).toBe(false);
    success(await h.store.write(input));
    expect(await readFile(path, "utf8")).toBe(bytes);
  });

  it("preserves another writer's winning transition when exclusive creation loses after preflight", async () => {
    const h = await trackedWriteFixture();
    const reference = h.reference("lineage/transition");
    const content = serializeTransitionRecord({ schemaVersion: 1, origin: "example", kind: "abandon", successors: [], edges: [] });
    const winning = serializeTransitionRecord({ schemaVersion: 1, origin: "example", kind: "rename", successors: ["next"], edges: [] });
    const path = join(h.root, resolveArcPath({ kind: "transition-record", origin: reference.owner.name }));
    const original = h.ports.fs.exclusiveCreate;
    h.ports.fs.exclusiveCreate = async (target, bytes) => {
      if (target === path) await writeFile(target, winning, { flag: "wx" });
      await original(target, bytes);
    };
    expect(await h.store.write({ action: "put", reference, content, expected: null, provenance })).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [reference] } });
    expect(await readFile(path, "utf8")).toBe(winning);
    expect(success(await h.store.read({ reference }))).toMatchObject({ content: winning, version: trackedDigest(winning) });
  });

  it("upgrades a legacy boundary to exactly today's writer bytes and returns the digest its read gives", async () => {
    const h = await trackedWriteFixture();
    const candidateId = `sha256:${"c".repeat(64)}`;
    const reservation = createStandardReviewReservation({ candidateId, sourceId: "coderabbit-pr",
      target: { kind: "delivery", repository: "arc-framework/example", workUnitId: "example", planId: "11111111-1111-4111-8111-111111111111" },
      obligation: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
        rubricDigest: CanonicalDigestSchema.parse(`sha256:${"b".repeat(64)}`), retrigger: "full-final", count: 1 } });
    const current = projectPublicationBoundary({ workUnit: "example", candidateId, branch: "feat/example", reservation,
      changeRequest: { repository: "arc-framework/example", pullRequest: 42 } });
    const legacy = { ...current, locus: "hosted-review-pending", nextAction: { kind: "continue-hosted-review",
      command: "arc review status --target '{targetRef}' --json", interactionText: current.nextAction.interactionText } };
    const parsed = parseIntegrationBoundaryLocus(legacy);
    expect(parsed.locus).toBe("delivery-status-required");
    const reference = h.reference("review/integration-boundary");
    const result = success(await h.store.write({ action: "put", reference, content: JSON.stringify(legacy), expected: null, provenance }));
    const comparisonRoot = join(h.root, "comparison");
    await mkdir(comparisonRoot);
    const existingPath = await writeSubmissionBoundary(comparisonRoot, parsed, null);
    const existing = await readFile(join(comparisonRoot, existingPath), "utf8");
    expect(success(await h.store.read({ reference }))).toMatchObject({ content: existing, version: result.version });
    expect(result.version).toBe(trackedDigest(existing));
  });

  it("writes Candidate and transition bytes equal to their existing writers", async () => {
    const h = await trackedWriteFixture();
    const comparisonRoot = join(h.root, "comparison");
    await mkdir(comparisonRoot);
    const candidate = candidateFixture();
    const transition = { schemaVersion: 1 as const, origin: "example", kind: "abandon" as const, successors: [], edges: [] };
    await writeCandidateRecord(comparisonRoot, "example", candidate, null);
    await writeTransitionRecord(comparisonRoot, transition);
    for (const [kind, content, address] of [
      ["review/candidate", candidate, { kind: "candidate-record", slug: SlugSchema.parse("example") }],
      ["lineage/transition", transition, { kind: "transition-record", origin: SlugSchema.parse("example") }],
    ] as const) {
      const reference = h.reference(kind);
      const result = success(await h.store.write({ action: "put", reference, content: JSON.stringify(content), expected: null, provenance }));
      const existing = await readFile(join(comparisonRoot, resolveArcPath(address)), "utf8");
      expect(success(await h.store.read({ reference }))).toMatchObject({ content: existing, version: result.version });
      expect(result.version).toBe(trackedDigest(existing));
    }
  });

  for (const kind of ["review/candidate", "review/integration-boundary"] as const) {
    it(`maps ${kind}'s real writer conflict without overwriting the intervening writer`, async () => {
      const h = await trackedWriteFixture();
      const reference = h.reference(kind);
      const content = JSON.stringify(kind === "review/candidate" ? candidateFixture() : boundaryFixture());
      const initial = success(await h.store.write({ action: "put", reference, content, expected: null, provenance }));
      const address = kind === "review/candidate" ? { kind: "candidate-record" as const, slug: reference.owner.name }
        : { kind: "integration-boundary-record" as const, slug: reference.owner.name };
      const path = join(h.root, resolveArcPath(address));
      const before = await readFile(path, "utf8");
      const winner = before + "\n";
      const read = h.ports.fs.readFile;
      let targetReads = 0;
      h.ports.fs.readFile = async (target) => {
        if (target === path && ++targetReads === 2) await writeFile(path, winner);
        return read(target);
      };
      expect(await h.store.write({ action: "put", reference, content, expected: initial.version!, provenance })).toMatchObject({ status: "refused",
        refusal: { code: "version-conflict", records: [reference] } });
      expect(await readFile(path, "utf8")).toBe(winner);
      expect(success(await h.store.read({ reference }))).toMatchObject({ content: winner, version: trackedDigest(winner) });
      const repaired = success(await h.store.write({ action: "put", reference, content, expected: trackedDigest(winner), provenance }));
      expect(repaired.version).toBe(trackedDigest(before));
    });
  }

  it("computes the canonical digest without reading the target again after the writer lands", async () => {
    const h = await trackedWriteFixture();
    const reference = h.reference("review/candidate");
    const path = join(h.root, resolveArcPath({ kind: "candidate-record", slug: reference.owner.name }));
    const write = h.ports.fs.writeFile;
    const read = h.ports.fs.readFile;
    let landed = false;
    h.ports.fs.writeFile = async (target, bytes) => { await write(target, bytes); if (target === path) landed = true; };
    h.ports.fs.readFile = async (target) => {
      if (target === path && landed) throw new Error("A result must use its serializer bytes, not re-read the target");
      return read(target);
    };
    const content = JSON.stringify(candidateFixture());
    const result = success(await h.store.write({ action: "put", reference, content, expected: null, provenance }));
    expect(result.version).toBe(trackedDigest(serializeCandidateManagedRecord(candidateFixture())));
    expect(result.version).toBe(trackedDigest(await readFile(path, "utf8")));
  });

  for (const kind of ["review/integration-boundary", "lineage/transition"] as const) {
    it(`refuses malformed ${kind} before its stale basis and admits the corrected record`, async () => {
      const h = await trackedWriteFixture();
      const reference = h.reference(kind);
      const input = { action: "put" as const, reference, content: "{\"schemaVersion\":1}", expected: RecordVersionSchema.parse("stale"), provenance };
      expect(await h.store.write(input)).toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference, rule: expect.any(String) } });
      const address = kind === "review/integration-boundary" ? { kind: "integration-boundary-record" as const, slug: reference.owner.name }
        : { kind: "transition-record" as const, origin: reference.owner.name };
      const path = join(h.root, resolveArcPath(address));
      expect(await exists(path)).toBe(false);
      const content = JSON.stringify(kind === "review/integration-boundary" ? boundaryFixture()
        : { schemaVersion: 1, origin: "example", kind: "abandon", successors: [], edges: [] });
      const written = success(await h.store.write({ ...input, content, expected: null }));
      expect(success(await h.store.read({ reference }))).toMatchObject({ version: written.version });
    });
  }
});
