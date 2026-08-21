/** Repository-shared descriptor store for immutable local review sources. */

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import {
  LocalReviewSourceSchema,
  type LocalReviewSource,
} from "../../core/local-review-source.js";
import type { LocalReviewSourceStore } from "../../core/ports.js";
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import { LocalReviewRecordStoreError } from "./record-store-error.js";

function sourceRecordName(source: LocalReviewSource): string {
  const digest = canonicalDigest({
    reachabilityRef: source.reachabilityRef,
    materializationRef: source.materializationRef,
  }).slice("sha256:".length);
  return `source-${digest}.json`;
}

function parseSource(raw: string): LocalReviewSource {
  try {
    return LocalReviewSourceSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new LocalReviewRecordStoreError("malformed-local-source", { cause: error });
  }
}

/** Append-only Git-common source descriptor store. */
export class RepositoryLocalReviewSourceStore implements LocalReviewSourceStore {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  async readSource(sourceRef: string): Promise<LocalReviewSource | null> {
    const raw = await this.publisher.read({ root: "review-gate", namespace: "sources" }, sourceRef);
    return raw === null ? null : parseSource(raw);
  }

  async appendSource(sourceInput: LocalReviewSource): Promise<{ sourceRef: string }> {
    const source = LocalReviewSourceSchema.parse(sourceInput);
    const sourceRef = sourceRecordName(source);
    return this.publisher.update({ root: "review-gate", namespace: "sources" }, sourceRef, (raw) => {
      if (raw !== null) {
        const existing = parseSource(raw);
        if (canonicalize(existing) !== canonicalize(source)) {
          throw new LocalReviewRecordStoreError("local-source-conflict");
        }
        return { kind: "keep", result: { sourceRef } };
      }
      return {
        kind: "write",
        content: `${JSON.stringify(source)}\n`,
        result: { sourceRef },
      };
    });
  }
}
