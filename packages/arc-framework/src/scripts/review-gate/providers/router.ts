/** Provider-neutral dispatch across policy-qualified hosted adapters. */

import type { Evidence } from "../core/evidence.js";
import type { ReviewRequest, SourceCapacity } from "../core/execution.js";
import type { ProviderObservation, RequestAcknowledgement, ReviewProviderAdapter } from "../core/ports.js";

export type ProviderSourceResolver = (requestIdentity: string) => Promise<string | null>;

/** Route each operation to exactly one configured source without widening the provider port. */
export class QualifiedProviderRouter implements ReviewProviderAdapter {
  private readonly adapters: ReadonlyMap<string, ReviewProviderAdapter>;
  private readonly resolveSource: ProviderSourceResolver;

  constructor(input: { adapters: ReadonlyMap<string, ReviewProviderAdapter>; resolveSource: ProviderSourceResolver }) {
    this.adapters = input.adapters;
    this.resolveSource = input.resolveSource;
  }

  private adapter(sourceIdentity: string): ReviewProviderAdapter {
    const adapter = this.adapters.get(sourceIdentity);
    if (adapter === undefined) throw new Error(`provider-router: source is not qualified: ${sourceIdentity}`);
    return adapter;
  }

  async readCapacity(sourceIdentity: string): Promise<SourceCapacity> {
    return this.adapter(sourceIdentity).readCapacity(sourceIdentity);
  }

  async qualifyRequest(request: ReviewRequest): Promise<{ qualified: boolean; reason: string }> {
    return this.adapter(request.sourceIdentity).qualifyRequest(request);
  }

  async request(request: ReviewRequest): Promise<RequestAcknowledgement> {
    return this.adapter(request.sourceIdentity).request(request);
  }

  async observe(requestIdentity: string): Promise<ProviderObservation[]> {
    const sourceIdentity = await this.resolveSource(requestIdentity);
    if (sourceIdentity === null) throw new Error("provider-router: request identity is not in the canonical ledger");
    return this.adapter(sourceIdentity).observe(requestIdentity);
  }

  async normalizeEvidence(observations: ProviderObservation[]): Promise<Evidence[]> {
    const sourceIdentity = observations[0]?.sourceIdentity;
    if (sourceIdentity === undefined) return Promise.resolve([]);
    if (observations.some((observation) => observation.sourceIdentity !== sourceIdentity)) {
      throw new Error("provider-router: mixed-source observation batch");
    }
    return this.adapter(sourceIdentity).normalizeEvidence(observations);
  }
}
