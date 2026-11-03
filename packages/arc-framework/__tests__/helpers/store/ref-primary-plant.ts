/** Concurrent primary identities planted below local namespace admission. */
import type { RefConformanceFixture } from "./ref-fixture.js";
import { plantRef } from "./ref-plant.js";
import { expandStoredPath } from "../../../src/lib/store/stored-path.js";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";

/** Plant one valid live primary as a concurrent writer's already-arrived state. */
export async function plantRefPrimary(f: RefConformanceFixture, input: {
  kind: "work-item/meta" | "work-item/record" | "cohort/document";
  uid: string; name: string; content?: string;
}) {
  const cohort = input.kind === "cohort/document";
  const reference = RecordReferenceSchema.parse({ kind: input.kind,
    owner: { type: cohort ? "cohort" : "work-item", name: input.name, uid: input.uid } });
  const registry = f.ports.registry;
  if (registry === undefined) throw new Error("Missing fixture registry");
  const home = expandStoredPath(reference, { registry });
  const metadata = { formatVersion: 1, formats: {}, slug: input.name, formerSlugs: [],
    ...(cohort ? {} : { primary: { role: input.kind, placement: { kind: "active" } } }) };
  await plantRef(f.root, home.ref, [
    { path: `metadata-${input.uid}.json`, content: JSON.stringify(metadata) },
    { path: home.path, content: input.content ?? f.content(reference) },
  ], { gitDir: f.gitDir });
  return reference;
}
