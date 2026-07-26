/** Kernel-composed discovery for locus contracts. */

import { createKernelRegistry, type KernelRegistry } from "../kernel/index.js";
import {
  LocusEnvelopeV1Schema,
  LocusIdentityV1Schema,
  LocusMutationResultV1Schema,
  LocusRecordV1Schema,
  LocusStateV1Schema,
} from "./schema/index.js";

export const LOCUS_SCHEMA_IDS = {
  envelope: "locus-envelope",
  identity: "locus-identity",
  mutationResult: "locus-mutation-result",
  record: "locus-record",
  state: "locus-state",
} as const;

const STRICT_CURRENT_V1 = { version: 1, migrationPosture: "strict-current" } as const;

/** Create an isolated kernel registry extended with locus roots. */
export function createLocusRegistry(): KernelRegistry {
  const registry = createKernelRegistry();
  registry.register(LocusEnvelopeV1Schema, { id: LOCUS_SCHEMA_IDS.envelope, ...STRICT_CURRENT_V1 });
  registry.register(LocusIdentityV1Schema, { id: LOCUS_SCHEMA_IDS.identity, ...STRICT_CURRENT_V1 });
  registry.register(LocusMutationResultV1Schema, { id: LOCUS_SCHEMA_IDS.mutationResult, ...STRICT_CURRENT_V1 });
  registry.register(LocusRecordV1Schema, { id: LOCUS_SCHEMA_IDS.record, ...STRICT_CURRENT_V1 });
  registry.register(LocusStateV1Schema, { id: LOCUS_SCHEMA_IDS.state, ...STRICT_CURRENT_V1 });
  return registry;
}
