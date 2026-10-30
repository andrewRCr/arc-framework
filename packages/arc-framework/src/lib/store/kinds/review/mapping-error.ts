/** Review mapping failures attributed to the one supplied source that caused them. */

/** A supplied review source the mapping cannot translate. */
export class ReviewMappingSourceError extends Error {
  /**
   * @param joins - The records the source joins, whose absence or mismatch fails it as surely as its own bytes
   */
  constructor(readonly source: string, cause: unknown, readonly joins?: string) {
    super(`Review source ${source} cannot be mapped: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "ReviewMappingSourceError";
  }
}

/** Run one source's mapping step, naming that source, and any records it joins, in a failure it raises. */
export function mapReviewSource<T>(source: string, step: () => T, joins?: string): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof ReviewMappingSourceError) throw error;
    throw new ReviewMappingSourceError(source, error, joins);
  }
}
