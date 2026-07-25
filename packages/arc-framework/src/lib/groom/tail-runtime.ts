/** Node wiring that supplies real evidence to the grooming settlement composition. */

import type { LocusMutationResultV1 } from "../locus/schema/index.js";
import type { SelectedLocusGeneration } from "../locus/selected-generation.js";
import {
  createGhChangeRequestLifecyclePort,
  resolveChangeRequestLifecycleConfiguration,
  transientTailRetirementTransform,
  type ChangeRequestLifecycleEvidence,
} from "../errand/change-request-lifecycle.js";
import {
  readExactBranchGeneration,
  tearDownExactBranchGeneration,
} from "../errand/exact-branch-generation.js";
import type { GroomIdentityRecord } from "../errand/identity-claims.js";
import {
  transactTransientIdentities,
  type IdentityTransform,
} from "../errand/identity-transaction.js";
import {
  createGroomRuntimeLocus,
  groomEvidenceDependencies,
  identityOutcome,
  readGroomClaim,
  type CloseGroomRuntimeOptions,
} from "./close-runtime.js";
import { settleGroom, type GroomTailReading } from "./tail-locus.js";

export interface SettleGroomRuntimeOptions extends CloseGroomRuntimeOptions {
  readonly action: "finalize" | "abandon";
  /** Present when a caller already selected and validated one exact generation to settle. */
  readonly selected?: SelectedLocusGeneration;
}

/** Settle an open or awaiting grooming generation without widening branch authority. */
export async function settleGroomAtRuntime(options: SettleGroomRuntimeOptions): Promise<LocusMutationResultV1> {
  const locus = createGroomRuntimeLocus(options);
  const evidence = groomEvidenceDependencies(options, locus);
  // Retirement authorizes against the exact host truth the tail read proved, so the evidence is
  // held from that read rather than re-fetched under a host that may have moved.
  let tail: ChangeRequestLifecycleEvidence | null = null;

  return settleGroom({
    anchorStub: options.anchorStub,
    action: options.action,
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    dependencies: {
      readState: evidence.readState,
      readCheckout: evidence.readCheckout,
      cleanupOccupancy: evidence.cleanupOccupancy,
      readClaim: () => readGroomClaim(options),
      readTail: async (record) => {
        const configured = await resolveChangeRequestLifecycleConfiguration(options.exec, options.base);
        if (configured === null) return unavailable("Change-request coordinates are unavailable.");
        tail = await createGhChangeRequestLifecyclePort(options.exec).read(configured, record.changeRequest);
        return { kind: "read", truth: tail.kind };
      },
      readBranchGeneration: (record) => readExactBranchGeneration(options.exec, {
        branch: record.branch, subject: "grooming", temporaryRefNamespace: "refs/arc/tmp/groom-abandon",
      }),
      tearDownBranch: (record, expectedHead) => tearDownExactBranchGeneration(options.exec, {
        branch: record.branch, expectedHead, subject: "grooming",
        temporaryRefNamespace: "refs/arc/tmp/groom-settle",
      }),
      retire: async (retirement) => {
        const lifecycle = tail;
        if (retirement.kind === "merged-tail" && lifecycle === null) {
          return { kind: "error", stage: "transform", message: "Grooming tail evidence is unavailable." };
        }
        return identityOutcome(await transactTransientIdentities(identityIO(options), {
          remote: "origin", message: `arc: ${options.action} groom ${options.anchorStub}`,
          transform: retirement.kind === "merged-tail" && lifecycle !== null
            ? transientTailRetirementTransform({
              previous: retirement.record, action: options.action, lifecycle,
            })
            : retireUnchangedGroomTransform(retirement.record),
        }));
      },
    },
  });
}

/** Retire an open grooming generation only while it still matches the one settlement decided on. */
function retireUnchangedGroomTransform(record: GroomIdentityRecord): IdentityTransform<null> {
  return (records) => {
    const actual = records.get(record.slug);
    if (actual === undefined) return { kind: "idempotent" as const, value: null };
    if (JSON.stringify(actual) !== JSON.stringify(record)) {
      return { kind: "refused" as const, reason: "Groom identity changed" };
    }
    const next = new Map(records); next.delete(record.slug);
    return { kind: "applied" as const, records: next, value: null };
  };
}

function unavailable(message: string): GroomTailReading {
  return { kind: "unavailable", message };
}

function identityIO(options: SettleGroomRuntimeOptions) {
  return { exec: options.exec, execInput: options.execInput, identity: options.identity };
}
