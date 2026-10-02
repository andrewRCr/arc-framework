/** Registry completeness and layout authority prevent backend-specific naming. */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KIND_REGISTRY, FAMILY_REGISTRY, KIND_SHAPES, FAMILY_IDS, createKindRegistry,
  MACHINE_LOCAL_PATHS, DERIVED_VIEWS, type KindId,
} from "../../../../src/lib/store/index.js";
import { resolveArcPath, ArcLayoutAddressSchema } from "../../../../src/lib/layout/index.js";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : entry.name.endsWith(".ts") ? [file] : [];
  });
}

const kinds = Object.values(KIND_REGISTRY);
const pending = ["review/candidate", "review/integration-boundary", "lineage/transition", "project-inbox/inbox", "personal/inbox"];

describe("role-based storage registry", () => {
  it("covers every declared kind once and leaves only reserved families empty", () => {
    expect(Object.keys(KIND_REGISTRY).sort()).toEqual(Object.keys(KIND_SHAPES).sort());
    for (const id of FAMILY_IDS) {
      const members = kinds.filter((kind) => kind.family === id);
      expect(members.length === 0).toBe(FAMILY_REGISTRY[id].reserved);
      expect(members.every((kind) => kind.id.startsWith(`${id}/`))).toBe(true);
    }
  });
  it("declares owner cardinality, key shape, and initial format for every record", () => {
    for (const kind of kinds) {
      expect(["work-item", "cohort", "project", "person"]).toContain(kind.owner);
      expect([null, "name", "path", "slug", "id", "pass"]).toContain(kind.key);
      expect(kind.formatVersion).toBe(1);
      expect(kind.parser).toBeNull();
    }
  });
  it("preserves conflicts in every unreserved family and routing receipts beside inboxes", () => {
    for (const family of Object.values(FAMILY_REGISTRY).filter((entry) => !entry.reserved)) {
      expect(kinds.some((kind) => kind.family === family.id && kind.id.endsWith("/conflict-record"))).toBe(true);
      if (kinds.some((kind) => kind.family === family.id && kind.id.endsWith("/inbox"))) {
        expect(kinds.some((kind) => kind.family === family.id && kind.id.endsWith("/routing-receipt"))).toBe(true);
      }
    }
  });
  it("isolates parser registration without changing storage properties", () => {
    const parser = (content: string) => ({ success: true as const, data: { text: content } });
    const registered = createKindRegistry({ "work-item/meta": parser });
    expect(registered["work-item/meta"].parser?.("bytes")).toEqual({ success: true, data: { text: "bytes" } });
    expect(KIND_REGISTRY["work-item/meta"].parser).toBeNull();
    expect(registered["work-item/meta"].merge).toBe("single-writer");
  });
  it("has a finder or address for each housed record with exactly five pending additions", () => {
    for (const kind of kinds) {
      if (kind.inRepo.substrate === "tracked" || kind.inRepo.substrate === "personal") {
        expect(kind.inRepo.address !== undefined || kind.inRepo.finder !== undefined).toBe(true);
      }
    }
    expect(kinds.filter((kind) => kind.inRepo.address?.pending).map((kind) => kind.id).sort()).toEqual(pending.sort());
    expect(KIND_REGISTRY["work-item/companion"].inRepo.finder).toBe("companions");
    expect(KIND_REGISTRY["personal/document"].inRepo.finder).toBe("personal-documents");
    expect(KIND_REGISTRY["personal/session-context"].interim).toBe(true);
    expect(KIND_REGISTRY["lineage/transition"].writerRule).toBe("create-only");
  });
  it("projects declared addresses only through the layout authority", () => {
    for (const kind of kinds) {
      for (const candidate of [typeof kind.projection === "object" ? kind.projection : undefined, kind.inRepo.address]) {
        if (candidate === undefined || candidate.kind === "pending") continue;
        let address: unknown;
        if (candidate.kind === "work-unit-artifact") address = { ...candidate, slug: "example", placement: { kind: "active", scope: { kind: "project" } } };
        else if (candidate.kind === "cohort-document") address = { kind: "cohort-document", cohort: ["example"], placement: { kind: "planned" } };
        else address = { kind: "user-document", identity: "andrew", document: { kind: candidate.document, ...(candidate.document === "session-notes" ? { workUnit: "example" } : {}) } };
        expect(resolveArcPath(ArcLayoutAddressSchema.parse(address))).toMatch(/^\.arc\//u);
      }
    }
  });
  it("assigns entry shapes to housed lists and no pre-flip home to new lists", () => {
    for (const kind of kinds.filter((entry) => entry.merge === "entry")) {
      if (kind.inRepo.substrate === "none") continue;
      expect(kind.entry?.sections.length).toBeGreaterThan(0);
      expect(["heading", "field-header"]).toContain(kind.entry?.shape);
    }
    expect(KIND_REGISTRY["personal/inbox"].entry?.sections).toEqual(["Errand", "Work Unit"]);
    expect(KIND_REGISTRY["personal/working-memory"].entry?.shape).toBe("field-header");
  });
  it("shares ref placement only through a declared subtree", () => {
    const patterns = Object.values(FAMILY_REGISTRY).flatMap((family) => family.ref !== null && "pattern" in family.ref ? [family.ref.pattern] : []);
    expect(new Set(patterns).size).toBe(patterns.length);
    expect(FAMILY_REGISTRY.review.ref).toEqual({ subtreeOf: "work-item", path: "review" });
    expect(FAMILY_REGISTRY.lineage.ref).toEqual({ subtreeOf: "project-registry", path: "lineage" });
    expect(FAMILY_REGISTRY["project-machinery"].ref).toBeNull();
    expect(FAMILY_REGISTRY.constitution.ref).toBeNull();
  });
  it("changes profile assignment only for the two ghost families", () => {
    expect(Object.values(FAMILY_REGISTRY).filter((family) => family.profiles.standard !== family.profiles.ghost).map((family) => family.id).sort()).toEqual(["constitution", "project-machinery"]);
    expect(MACHINE_LOCAL_PATHS).toContainEqual({ root: "user", pattern: "<identity>/.internal/**" });
    expect(MACHINE_LOCAL_PATHS).toContainEqual({ root: "git-common", pattern: "arc/**" });
    expect(DERIVED_VIEWS).toEqual(["project-status", "identity-status", "archive-index"]);
  });
  it("keeps presentation filenames out of the production store core", () => {
    const root = resolve(import.meta.dirname, "../../../../src/lib/store");
    const sources = sourceFiles(root);
    for (const source of sources) expect(readFileSync(source, "utf8")).not.toMatch(/(?:USER-INBOX|WORKING-MEMORY|SESSION-NOTES|ATOMIC-INBOX|ROADMAP|STATUS\.USER)\.(?:md|json)/u);
  });
  it("records every interim family substrate explicitly", () => {
    const unhomed: KindId[] = ["work-item/description", "work-item/inbound", "personal/errand-queue", "review/evidence", "review/outcome", "review/terminus", "review/adversarial-pass", "project-registry/identity", "project-registry/counter", "project-machinery/prose", "constitution/prose"];
    for (const id of unhomed) expect(KIND_REGISTRY[id].inRepo.substrate).toBe("none");
    expect(KIND_REGISTRY["work-item/record"].inRepo.substrate).toBe("transient-identity");
    expect(KIND_REGISTRY["claims/groom"].inRepo.substrate).toBe("transient-identity");
    expect(KIND_REGISTRY["claims/housekeep"].inRepo.substrate).toBe("transient-identity");
  });
});
