/** Provider-neutral host observations and mutations for delivery execution. */

import type {
  DeliveryChangeRequestV1,
  DeliveryLandEffectV1,
  DeliveryPublishEffectV1,
  DeliveryTargetCoordinatesV1,
  DeliveryTopRemedyEffectV1,
} from "./schema.js";

/** One exact host request selected by repository, head, and base identity. */
export interface DeliveryHostChangeRequest {
  readonly binding: DeliveryChangeRequestV1;
  readonly repository: string;
  readonly headRepository: string;
  readonly headRef: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly state: "open" | "merged" | "closed";
  readonly draft: boolean;
}

/** Closed observation result; non-unique and unavailable evidence never guesses. */
export type DeliveryHostRequestObservation =
  | { readonly status: "observed"; readonly request: DeliveryHostChangeRequest }
  | { readonly status: "absent" }
  | { readonly status: "refused"; readonly reason: "multiple" | "foreign" | "queued" | "malformed" | "unavailable" };

/** Authored request presentation passed to the host without becoming state authority. */
export interface DeliveryHostOpenRequest {
  readonly effect: DeliveryPublishEffectV1;
  readonly title: string;
  readonly body: string;
}

/** Closed mutation outcome; callers must reobserve before accepting host-assigned results. */
export type DeliveryHostMutationResult =
  | { readonly status: "submitted" }
  | {
      readonly status: "refused";
      readonly reason: "queued" | "malformed" | "unavailable" | "native-stack-required";
    };

/** Failure-only mutation boundary kept separate from ordinary publication and landing. */
export interface DeliveryTopRemedyHostPort {
  applyTopRemedy(effect: DeliveryTopRemedyEffectV1): Promise<DeliveryHostMutationResult>;
}

/** Narrow host port used by materialization and ordinary landing. */
export interface DeliveryHostPort {
  observeRequest(effect: DeliveryPublishEffectV1): Promise<DeliveryHostRequestObservation>;
  openRequest(input: DeliveryHostOpenRequest): Promise<DeliveryHostMutationResult>;
  readRequest(repository: string, binding: DeliveryChangeRequestV1): Promise<DeliveryHostRequestObservation>;
  mergeRequest(effect: DeliveryLandEffectV1): Promise<DeliveryHostMutationResult>;
  observeTarget(repository: string, targetRef: string): Promise<
    | { readonly status: "observed"; readonly coordinates: DeliveryTargetCoordinatesV1 }
    | { readonly status: "refused"; readonly reason: "malformed" | "unavailable" }
  >;
}
