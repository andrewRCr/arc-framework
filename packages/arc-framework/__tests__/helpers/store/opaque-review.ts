/** Production kinds with the review family read as opaque machine records, for ref mechanics independent of review codecs. */
import { createRefStore } from "../../../src/lib/store/create.js";
import { createKindRegistry, type KindDefinition } from "../../../src/lib/store/registry.js";
import type { KindId } from "../../../src/lib/store/catalog.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import { PRODUCTION_REGISTRATIONS } from "../../../src/lib/store/kinds/registrations.js";

type Registry = Readonly<Record<KindId, KindDefinition>>;

/** Drop the review family's parsers and write checks, keeping every other production definition. */
export function opaqueReviewRegistry(base: Registry = createKindRegistry(PRODUCTION_REGISTRATIONS)): Registry {
  return Object.fromEntries(Object.entries(base).map(([kind, definition]) => [kind,
    definition.family === "review" ? { ...definition, parser: undefined, check: undefined } : definition])) as Registry;
}

/** Rebind each clone's store to the opaque review registry before any record is written. */
export function withOpaqueReview<T extends Record<"a" | "b", { ports: RefStorePorts; store: ReturnType<typeof createRefStore> }>>(fixture: T): T {
  const rebind = <C extends T["a"]>(clone: C): C => {
    const ports = { ...clone.ports, registry: opaqueReviewRegistry() };
    return { ...clone, ports, store: createRefStore(ports) };
  };
  return { ...fixture, a: rebind(fixture.a), b: rebind(fixture.b) };
}
