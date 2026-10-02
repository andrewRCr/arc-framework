/** Off-branch current identity comes from real ownership markers and reference fixture hooks. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { resolveCurrentWorkUnit } from "../../../../src/lib/store/current-work-unit.js";
import { writeWorktreeOwnershipMarker, writeWorktreeMarker, readWorktreeMarker, stampWorktreeHusk, resolveWorktreeMarkerPath } from "../../../../src/lib/git/worktree-marker.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import type { Store } from "../../../../src/lib/store/contract.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-current-claim-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const reference = createReferenceFixture();
  const record = await seed(reference, reference.reference("work-item/meta"));
  const marker = async () => writeWorktreeOwnershipMarker(cwd, { createdByArc: true,
    createdFor: { kind: "work-unit", name: record.reference.owner.name }, spawningIdentity: "andrew", now: 0 });
  return { cwd, reference, record, marker, resolve: () => resolveCurrentWorkUnit({ cwd, store: reference.store }) };
}

describe("current work-unit marker fallback", () => {
  it("resolves an unhusked marker claim to the reference backend's minted UID", async () => {
    const h = await fixture();
    await h.marker();
    expect(await h.resolve()).toMatchObject({ status: "resolved", candidate: { reference: h.record.reference }, warnings: [] });
  });

  it.each(["absent", "errand", "branch", "husk"])("finds none for an %s checkout marker", async (kind) => {
    const h = await fixture();
    if (kind === "errand" || kind === "branch") await writeWorktreeOwnershipMarker(h.cwd, { createdByArc: true,
      createdFor: kind === "errand" ? { kind: "errand", slug: "example" } : { kind: "branch", ref: "main" }, spawningIdentity: "andrew", now: 0 });
    if (kind === "husk") {
      await h.marker();
      await stampWorktreeHusk(h.cwd, { sha: "a".repeat(40), at: new Date(0).toISOString(),
        subject: { kind: "work-unit", name: h.record.reference.owner.name }, branch: `feat/${h.record.reference.owner.name}` });
    }
    expect(await h.resolve()).toEqual({ status: "none", candidates: [], warnings: [] });
  });

  it.each(["errand", "groom", "housekeep"] as const)("finds none for a generation-bearing %s claim", async (kind) => {
    const h = await fixture();
    await h.marker();
    const produced = await readWorktreeMarker(h.cwd);
    expect(produced.kind).toBe("present");
    if (produced.kind !== "present") throw new Error("The marker producer did not create its record");
    await writeWorktreeMarker(h.cwd, { spawnedByArc: produced.marker.spawnedByArc, createdAt: produced.marker.createdAt,
      spawningIdentity: produced.marker.spawningIdentity, createdFor: { kind, slug: h.record.reference.owner.name, claimId: "1".repeat(32) }, provisioning: "ready" });
    expect(await h.resolve()).toEqual({ status: "none", candidates: [], warnings: [] });
  });

  it.each(["completed", "backlog", "removed"])("finds none once the marker's work unit is %s", async (kind) => {
    const h = await fixture();
    await h.marker();
    if (kind === "removed") success(await h.reference.store.write({ action: "remove", reference: h.record.reference,
      expected: h.record.version, provenance: { verb: "remove", lifecycleAction: "remove" } }));
    else success(await h.reference.store.write({ action: "put", reference: h.record.reference, content: h.record.content,
      expected: h.record.version, placement: kind === "completed" ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }
        : { kind: "backlog", commitment: "planned" }, provenance: { verb: "move", lifecycleAction: "move" } }));
    expect(await h.resolve()).toEqual({ status: "none", candidates: [], warnings: [] });
  });

  it("warns on a malformed marker and resolves after replacing it through the producer", async () => {
    const h = await fixture();
    const path = resolveWorktreeMarkerPath(h.cwd);
    await mkdir(join(h.cwd, ".arc/system/.internal"), { recursive: true });
    await writeFile(path, "not JSON");
    expect(await h.resolve()).toMatchObject({ status: "none", warnings: [expect.stringContaining("malformed JSON")] });
    await h.marker();
    expect(await h.resolve()).toMatchObject({ status: "resolved", warnings: [] });
  });

  it("finds no current candidate for a missing claim and resolves once its actual record arrives", async () => {
    const h = await fixture();
    const reference = createReferenceFixture();
    await reference.produce("not-found:name");
    await writeWorktreeOwnershipMarker(h.cwd, { createdByArc: true, spawningIdentity: "andrew", now: 0,
      createdFor: { kind: "work-unit", name: reference.reference("work-item/meta", "missing").owner.name } });
    const resolve = () => resolveCurrentWorkUnit({ cwd: h.cwd, store: reference.store });
    expect(await resolve()).toEqual({ status: "none", candidates: [], warnings: [] });
    await reference.repair("not-found:name");
    expect(await resolve()).toMatchObject({ status: "resolved", warnings: [] });
  });

  it("warns on genuine claim ambiguity produced by the named hook and resolves after its repair", async () => {
    const h = await fixture();
    await h.marker();
    const reference = createReferenceFixture();
    await reference.produce("ambiguous-match");
    const resolve = () => resolveCurrentWorkUnit({ cwd: h.cwd, store: reference.store });
    expect(await resolve()).toMatchObject({ status: "none", warnings: [expect.stringContaining("more than one record")] });
    await reference.repair("ambiguous-match");
    expect(await resolve()).toMatchObject({ status: "resolved", warnings: [] });
  });

  it("warns on a primary's planted identity mismatch and resolves after its repair", async () => {
    const h = await fixture();
    await h.marker();
    const reference = createReferenceFixture();
    await reference.produce("identity-mismatch");
    const resolve = () => resolveCurrentWorkUnit({ cwd: h.cwd, store: reference.store });
    expect(await resolve()).toMatchObject({ status: "none", warnings: [expect.stringContaining("identity")] });
    await reference.repair("identity-mismatch");
    expect(await resolve()).toMatchObject({ status: "resolved", warnings: [] });
  });

  it("warns when the primary's identity fault arrives after a successful claim lookup", async () => {
    const h = await fixture();
    await h.marker();
    const reference = createReferenceFixture();
    await reference.produce("identity-mismatch");
    await reference.repair("identity-mismatch");
    const lookup = reference.store.lookup.bind(reference.store);
    const store = Object.create(reference.store) as Store;
    let inject = true;
    store.lookup = async (input) => {
      const found = await lookup(input);
      if (inject && found.status === "ok") await reference.plant(found.result.reference, "key-mismatch");
      return found;
    };
    const resolve = () => resolveCurrentWorkUnit({ cwd: h.cwd, store });
    expect(await resolve()).toMatchObject({ status: "none", warnings: [expect.stringContaining("identity")] });
    inject = false;
    await reference.repair("identity-mismatch");
    expect(await resolve()).toMatchObject({ status: "resolved", warnings: [] });
  });

  it("finds none when the primary disappears between lookup and read, then resolves its replacement", async () => {
    const h = await fixture();
    await h.marker();
    const lookup = h.reference.store.lookup.bind(h.reference.store);
    const store = Object.create(h.reference.store) as Store;
    let remove = true;
    store.lookup = async (input) => {
      const found = await lookup(input);
      if (remove && found.status === "ok") {
        const record = success(await h.reference.store.read({ reference: found.result.reference }));
        success(await h.reference.store.write({ action: "remove", reference: record.reference,
          expected: record.version, provenance: { verb: "remove", lifecycleAction: "remove" } }));
      }
      return found;
    };
    const resolve = () => resolveCurrentWorkUnit({ cwd: h.cwd, store });
    expect(await resolve()).toEqual({ status: "none", candidates: [], warnings: [] });
    remove = false;
    const replacement = await seed(h.reference, h.reference.reference("work-item/meta"));
    expect(await resolve()).toMatchObject({ status: "resolved", candidate: { reference: replacement.reference }, warnings: [] });
  });
});
