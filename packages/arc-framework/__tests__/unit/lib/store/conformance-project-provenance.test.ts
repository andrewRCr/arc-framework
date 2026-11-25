/** Shared history assertions admit a project whose identity has not been created. */
import { describe } from "vitest";
import { RecordReferenceSchema, type RecordReference, type Store } from "../../../../src/lib/store/index.js";
import { createReferenceFixture, referenceDeclarations } from "../../../helpers/store/reference-fixture.js";
import { registerHistoryAssertions } from "../../../helpers/store/suite-versions.js";

function withoutProjectUid(reference: RecordReference): RecordReference {
  return reference.kind !== "project-registry/counter" ? reference : RecordReferenceSchema.parse({ ...reference,
    owner: { type: "project", name: reference.owner.name } });
}

function uidlessProjectStore(store: Store, references: Map<string, RecordReference>): Store {
  const outward = (reference: RecordReference): RecordReference => {
    const visible = withoutProjectUid(reference);
    references.set(JSON.stringify(visible), reference);
    return visible;
  };
  const result = Object.create(store) as Store;
  result.write = async (input) => {
    const written = await store.write(input);
    return written.status !== "ok" ? written : { ...written, result: { ...written.result, reference: outward(written.result.reference) } };
  };
  result.read = async (input) => {
    const read = await store.read(input);
    return read.status !== "ok" ? read : { ...read, result: { ...read.result, reference: outward(read.result.reference) } };
  };
  result.history = async (input) => {
    const history = await store.history({ reference: references.get(JSON.stringify(input.reference)) ?? input.reference });
    if (history.status !== "ok") return history;
    return { ...history, result: history.result.map((entry) => {
      if (entry.reference.kind !== "project-registry/counter" || !("reference" in entry.provenance)) return entry;
      const provenance = { ...entry.provenance };
      delete provenance.ownerUid;
      return { ...entry, reference: withoutProjectUid(entry.reference),
        provenance: { ...provenance, reference: withoutProjectUid(provenance.reference) } };
    }) };
  };
  return result;
}

describe("history provenance before a project identity exists", () => {
  registerHistoryAssertions({ item: 11, registration: {
    declarations: { ...referenceDeclarations, families: ["project-registry"] },
    create() {
      const fixture = createReferenceFixture();
      const references = new Map<string, RecordReference>();
      return { ...fixture, store: uidlessProjectStore(fixture.store, references), reopen: () => uidlessProjectStore(fixture.reopen(), references) };
    },
  } });
});
