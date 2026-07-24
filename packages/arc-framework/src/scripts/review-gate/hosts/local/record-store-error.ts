/** Stable corrupt-state failure for repository-shared local review records. */

export class LocalReviewRecordStoreError extends Error {
  readonly code = "corrupt-state" as const;

  constructor(
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super(reason, options);
    this.name = "LocalReviewRecordStoreError";
  }
}
