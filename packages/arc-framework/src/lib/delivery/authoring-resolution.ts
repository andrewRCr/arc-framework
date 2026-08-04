/** Rename-aware singleton resolution and lifecycle operations for delivery authoring maps. */

import type {
  DeliveryAuthoringPair,
  DeliveryAuthoringRecord,
  DeliveryAuthoringStore,
  DeliveryAuthoringStoreFailure,
} from "./authoring-store.js";
import {
  resolveForwardDeliverySubject,
  type DeliveryRenameEvidenceAuthority,
  type DeliveryRenameTransitionSource,
  type ForwardDeliverySubjectResolution,
} from "./plan-resolution.js";

/** Outstanding-map lookup with the same authority semantics as plan lookup. */
export type ExistingDeliveryAuthoringMapResolution =
  ForwardDeliverySubjectResolution<DeliveryAuthoringRecord>;

/** Resolve one current unit against every original subject recorded by authoring state. */
export async function resolveExistingDeliveryAuthoringMap(input: {
  readonly store: Pick<DeliveryAuthoringStore, "enumerate">;
  readonly currentWorkUnitId: string;
  readonly authority: DeliveryRenameEvidenceAuthority;
  readonly transitionSource: DeliveryRenameTransitionSource;
}): Promise<ExistingDeliveryAuthoringMapResolution> {
  if (input.authority.status === "unestablished") {
    return { status: "indeterminate", reason: "reachability-unestablished" };
  }
  const records = await input.store.enumerate();
  if (records.status === "refused") {
    return { status: "indeterminate", reason: "namespace-corrupt" };
  }
  return resolveForwardDeliverySubject({
    records: records.value,
    currentWorkUnitId: input.currentWorkUnitId,
    recordWorkUnitId: (record) => record.snapshot.originalWorkUnitId,
    authority: input.authority,
    transitionSource: input.transitionSource,
  });
}

type DeliveryAuthoringManagerFailure = DeliveryAuthoringStoreFailure
  | "ambiguous-subject"
  | "namespace-corrupt"
  | "reachability-unestablished"
  | "substrate-unreachable";

/** Result of a singleton-aware authoring operation. */
export type DeliveryAuthoringManagerResult<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "refused"; readonly reason: DeliveryAuthoringManagerFailure };

/** Application service enforcing one outstanding map per rename-resolved unit. */
export class DeliveryAuthoringManager {
  constructor(
    private readonly store: DeliveryAuthoringStore,
    private readonly transitionSource: DeliveryRenameTransitionSource,
  ) {}

  async create(input: {
    readonly pair: DeliveryAuthoringPair;
    readonly currentWorkUnitId: string;
    readonly authority: DeliveryRenameEvidenceAuthority;
  }): Promise<DeliveryAuthoringManagerResult<DeliveryAuthoringPair>> {
    if (input.pair.snapshot.originalWorkUnitId !== input.currentWorkUnitId) {
      return { status: "refused", reason: "identity-mismatch" };
    }
    const existing = await this.resolve(input.currentWorkUnitId, input.authority);
    if (existing.status === "indeterminate") {
      return { status: "refused", reason: existing.reason };
    }
    if (existing.status === "match") {
      return { status: "refused", reason: "authoring-state-exists" };
    }
    return this.store.create(input.pair);
  }

  async abandon(input: {
    readonly currentWorkUnitId: string;
    readonly authority: DeliveryRenameEvidenceAuthority;
  }): Promise<DeliveryAuthoringManagerResult<{ readonly removed: boolean }>> {
    const existing = await this.resolve(input.currentWorkUnitId, input.authority);
    if (existing.status === "indeterminate") {
      return { status: "refused", reason: existing.reason };
    }
    if (existing.status === "no-match") {
      return { status: "ok", value: { removed: false } };
    }
    return this.store.abandon(existing.record.snapshot.mapId);
  }

  private resolve(
    currentWorkUnitId: string,
    authority: DeliveryRenameEvidenceAuthority,
  ): Promise<ExistingDeliveryAuthoringMapResolution> {
    return resolveExistingDeliveryAuthoringMap({
      store: this.store,
      currentWorkUnitId,
      authority,
      transitionSource: this.transitionSource,
    });
  }
}
