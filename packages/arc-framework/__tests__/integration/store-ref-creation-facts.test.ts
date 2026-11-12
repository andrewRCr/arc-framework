import { describe, expect, it } from "vitest";
import { CreatedOwnersSchema, RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("native creation evidence in %s layout", layout => {
  it("admits every check with complete actual births and known-empty evidence for later updates", async () => {
    let armed = false;
    let names = ["cohort-two", "work-item-two"];
    const check: WriteCheck = async ({ proposedCreatedOwners, after }) => {
      if (!armed) return [];
      const broken = [{ rule: "test.complete-births", condition: "This write needs the complete backend birth inventory.",
        remedy: { text: "Rebuild the operation with exact allocation evidence, then retry." } }];
      const parsed = CreatedOwnersSchema.safeParse(proposedCreatedOwners);
      if (!parsed.success || JSON.stringify(parsed.data.map(birth => birth.owner.name).sort()) !== JSON.stringify(names)) return broken;
      for (const birth of parsed.data) {
        const record = await after.read({ reference: RecordReferenceSchema.parse(birth) });
        if (record.status === "refused" || record.result.reference.owner.type === "person"
          || record.result.reference.owner.uid !== birth.owner.uid) return broken;
      }
      return [];
    };
    const f = await createRefFixture({ "personal/document": { check }, "work-item/meta": { check }, "cohort/document": { check } }, layout);
    const target = await seed(f, f.reference("personal/document"), "original\n");
    const work = f.reference("work-item/meta", "two"), cohort = f.reference("cohort/document", "two");
    armed = true;
    const result = success(await f.store.batch({ writes: [mutationOf(update(f, target, "accepted\n")),
      { action: "put", reference: work, expected: null, content: f.content(work), placement: { kind: "backlog", commitment: "planned" } },
      { action: "put", reference: cohort, expected: null, content: f.content(cohort) }], provenance: testProvenance }));
    expect(result.writes).toHaveLength(3);
    expect(success(await f.store.read({ reference: work })).reference.owner).toHaveProperty("uid");
    expect(success(await f.store.read({ reference: cohort })).reference.owner).toHaveProperty("uid");
    names = [];
    const current = success(await f.store.read({ reference: target.reference }));
    success(await f.store.write(update(f, current, "updated\n")));
    expect(success(await f.store.read({ reference: target.reference })).content).toBe("updated\n");
  });

  it("keeps an existing generation out of births during rename, role change, reopen, and companion creation", async () => {
    let armed = false;
    const check: WriteCheck = async ({ proposedCreatedOwners }) => !armed || proposedCreatedOwners?.length === 0 ? [] : [{
      rule: "test.existing-generation", condition: "An existing generation must not be advertised as a birth.",
      remedy: { text: "Use the existing generation's allocation evidence and retry." },
    }];
    const f = await createRefFixture({ "work-item/meta": { check }, "work-item/record": { check },
      "work-item/companion": { check } }, layout);
    const original = await seed(f, f.reference("work-item/meta"));
    armed = true;
    const renamedRef = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "renamed-work" } });
    success(await f.store.write({ ...update(f, original), reference: renamedRef }));
    const renamed = success(await f.store.read({ reference: renamedRef }));
    const role = RecordReferenceSchema.parse({ ...renamedRef, kind: "work-item/record" });
    success(await f.store.write({ ...update(f, renamed, f.content(role)), reference: role }));
    const promoted = success(await f.store.read({ reference: role }));
    success(await f.store.write({ ...update(f, promoted),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const archived = success(await f.store.read({ reference: role }));
    success(await f.store.write({ ...update(f, archived), placement: { kind: "active" } }));
    const companion = RecordReferenceSchema.parse({ owner: role.owner, kind: "work-item/companion", key: "retained.md" });
    success(await f.store.write({ action: "put", reference: companion, expected: null, content: "retained note\n", provenance: testProvenance }));
    expect(success(await f.store.read({ reference: companion })).content).toBe("retained note\n");
    expect(success(await f.store.read({ reference: role })).reference.owner).toEqual(role.owner);
  });


  it("publishes no candidate births on refusal and succeeds after the blocking condition is repaired", async () => {
    let held = true;
    const check: WriteCheck = async ({ proposedCreatedOwners }) => {
      if (proposedCreatedOwners?.length !== 1) return [{ rule: "test.birth-evidence",
        condition: "The candidate birth is unavailable.", remedy: { text: "Acquire the candidate's complete birth evidence and retry." } }];
      return held ? [{ rule: "test.birth-held", condition: "The new owner's allocation is temporarily held.",
        remedy: { text: "Release the allocation hold, then prepare and retry the write." } }] : [];
    };
    const f = await createRefFixture({ "work-item/meta": { check } }, layout);
    const reference = f.reference("work-item/meta");
    const before = success(await f.store.version());
    const request = { action: "put" as const, reference, expected: null, content: f.content(reference),
      placement: { kind: "backlog" as const, commitment: "planned" as const }, provenance: testProvenance };
    expect(await f.store.write(request)).toMatchObject({ status: "refused", refusal: { code: "record-malformed",
      rule: "test.birth-held", remedy: { text: expect.stringContaining("Release the allocation hold") } } });
    expect(success(await f.store.version())).toBe(before);
    expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    held = false;
    const written = success(await f.store.write(request));
    expect(success(await f.store.read({ reference })).reference).toEqual(written.reference);
    expect(success(await f.store.history({ reference: written.reference }))).toHaveLength(1);
  });

  it("rebuilds allocation evidence after another publisher changes an existing owner's home", async () => {
    let armed = false, intervened = false;
    const check: WriteCheck = async ({ proposedCreatedOwners, after }) => {
      if (!armed) return [];
      const births = proposedCreatedOwners ?? [];
      const candidate = births[0];
      const actual = candidate ? await after.read({ reference: RecordReferenceSchema.parse(candidate) }) : undefined;
      return births.length === 1 && candidate?.owner.name === "work-item-two" && actual?.status === "ok"
        && actual.result.reference.owner.type !== "person" && actual.result.reference.owner.uid === candidate.owner.uid ? [] : [{
          rule: "test.rebuilt-births", condition: "The retried operation lacks its newly resolved allocation evidence.",
          remedy: { text: "Resolve the moved owners again and retry with the rebuilt birth inventory." },
        }];
    };
    const f = await createRefFixture({ "work-item/meta": { check }, "work-item/notes": { check } }, layout);
    const original = await seed(f, f.reference("work-item/meta"));
    const companionRef = RecordReferenceSchema.parse({ owner: original.reference.owner, kind: "work-item/notes" });
    const companion = await seed(f, companionRef, "original note\n");
    const store = createRefStore({ ...f.ports, lock: async (ref, wait) => {
      if (!intervened && ref !== "layout") {
        intervened = true;
        success(await f.store.write({ ...update(f, original),
          placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
        armed = true;
      }
      return f.ports.lock(ref, wait);
    } });
    const fresh = f.reference("work-item/meta", "two");
    const result = success(await store.batch({ writes: [mutationOf(update(f, companion, "updated note\n")),
      { action: "put", reference: fresh, expected: null, content: f.content(fresh),
        placement: { kind: "backlog", commitment: "planned" } }], provenance: testProvenance }));
    expect(intervened).toBe(true);
    expect(result.writes).toHaveLength(2);
    expect(success(await store.read({ reference: companionRef })).content).toBe("updated note\n");
    expect(success(await store.read({ reference: original.reference })).placement?.kind).toBe("completed");
    expect(success(await store.read({ reference: fresh })).reference.owner).toHaveProperty("uid");
  });

});
