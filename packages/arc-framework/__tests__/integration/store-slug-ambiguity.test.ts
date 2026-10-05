/** Unqualified names preserve distinct tracked and transient primary candidates. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/index.js";
import { TransientIdentityRecordSchema, serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { serializeTransitionRecord } from "../../src/lib/work-unit/transition-record.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

const slug = SlugSchema.parse("alpha");
const owner = OwnerIdentitySchema.parse({ type: "work-item", name: slug });
const meta = recordReferences["work-item/meta"](owner);
const errand = recordReferences["work-item/record"](owner);
const claimId = "a".repeat(32);

async function fixture(tracked = true, transient = true, configured = true) {
  const h = await trackedWriteFixture();
  h.ports.identity = async () => SlugSchema.parse("andrew");
  await h.exec("git", ["commit", "--allow-empty", "-m", "Initial repository"]);
  await h.exec("git", ["branch", "feat/alpha"]);
  if (tracked) {
    await mkdir(join(h.root, ".arc/active"), { recursive: true });
    await writeFile(join(h.root, ".arc/active/meta-alpha.md"), makeMetaFixture("alpha", { branch: "feat/alpha" }));
  }
  if (transient) {
    const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", slug, claimId,
      purpose: "errand", origin: "description", originEntry: null, intent: "Independent Errand",
      branch: "chore/alpha", state: "open", savedHead: null, changeRequest: null,
      createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" });
    success(await h.store.write({ action: "put", reference: errand, expected: null,
      content: serializeTransientIdentityRecord(record), placement: { kind: "active" }, provenance: testProvenance }));
  }
  if (!configured) h.ports.identity = async () => null;
  return h;
}

describe("cross-substrate slug lookup", () => {
  it("reports both admitted primaries while preserving qualified claims and branches", async () => {
    const h = await fixture();
    for (const reference of [meta, errand]) success(await h.store.read({ reference }));
    for (const kind of ["work-item/meta", "work-item/record"] as const) {
      expect(success(await h.store.list({ family: "work-item", kind }))).toMatchObject({ status: "complete", records: [{ reference: kind === meta.kind ? meta : errand }] });
    }
    expect(await h.store.lookup({ kind: "slug", slug })).toMatchObject({ status: "refused", refusal: {
      code: "ambiguous-match", candidates: expect.arrayContaining([meta, errand]), remedy: { text: expect.any(String) },
    } });
    expect(success(await h.store.lookup({ kind: "claim", claim: { kind: "errand", slug, claimId } }))).toEqual({ reference: errand });
    expect(success(await h.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug } }))).toEqual({ reference: meta });
    for (const [ref, reference] of [["chore/alpha", errand], ["feat/alpha", meta]] as const) {
      expect(success(await h.store.lookup({ kind: "ref", repository: h.root, ref }))).toEqual({ reference });
    }
  });

  it("retains every tracked rename-lineage candidate beside the transient match", async () => {
    const h = await fixture();
    await writeFile(join(h.root, ".arc/active/meta-beta.md"), makeMetaFixture("beta"));
    await mkdir(join(h.root, ".arc/system/.internal/transitions"), { recursive: true });
    await writeFile(join(h.root, ".arc/system/.internal/transitions/alpha.json"), serializeTransitionRecord({ schemaVersion: 1,
      origin: "alpha", kind: "rename", successors: ["beta"], edges: [] }));
    const beta = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" }));
    const result = await h.store.lookup({ kind: "slug", slug });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", candidates: expect.arrayContaining([meta, beta, errand]) } });
    if (result.status === "refused" && result.refusal.code === "ambiguous-match") expect(result.refusal.candidates).toHaveLength(3);
  });

  it.each([[true, false, true, meta], [false, true, true, errand], [true, true, false, meta], [false, false, true, null]] as const)(
    "retains single-match and identity-absent behavior (tracked %s, transient %s, identity %s)", async (tracked, transient, configured, expected) => {
      const h = await fixture(tracked, transient, configured);
      const result = await h.store.lookup({ kind: "slug", slug });
      if (expected === null) expect(result).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      else expect(success(result)).toEqual({ reference: expected });
    });
});
