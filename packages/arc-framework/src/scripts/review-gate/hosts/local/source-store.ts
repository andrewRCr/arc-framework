/** Repository-shared descriptor store for immutable local review sources. */

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import {
  LocalReviewSourceSchema,
  type LocalReviewSource,
} from "../../core/local-review-source.js";
import type { LocalReviewSourceStore } from "../../core/ports.js";
import type { GitCommonStatePublisher } from "./git-common-state.js";

function sourceRecordName(source: LocalReviewSource): string {
  const digest = canonicalDigest({
    reachabilityRef: source.reachabilityRef,
    materializationRef: source.materializationRef,
  }).slice("sha256:".length);
  return `source-${digest}.json`;
}

/** Append-only Git-common source descriptor store. */
export class RepositoryLocalReviewSourceStore implements LocalReviewSourceStore {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  async readSource(sourceRef: string): Promise<LocalReviewSource | null> {
    const raw = await this.publisher.read("sources", sourceRef);
    return raw === null ? null : LocalReviewSourceSchema.parse(JSON.parse(raw));
  }

  async appendSource(sourceInput: LocalReviewSource): Promise<{ sourceRef: string }> {
    const source = LocalReviewSourceSchema.parse(sourceInput);
    const sourceRef = sourceRecordName(source);
    return this.publisher.update("sources", sourceRef, (raw) => {
      if (raw !== null) {
        const existing = LocalReviewSourceSchema.parse(JSON.parse(raw));
        if (canonicalize(existing) !== canonicalize(source)) {
          throw new Error("local-source-conflict");
        }
        return { content: null, result: { sourceRef } };
      }
      return {
        content: `${JSON.stringify(source)}\n`,
        result: { sourceRef },
      };
    });
  }
}
