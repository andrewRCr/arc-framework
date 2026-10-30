/** Review mapping failures attributed to the one supplied source that caused them. */

/** A supplied review source the mapping cannot translate. */
export class ReviewMappingSourceError extends Error {
  constructor(readonly source: string, cause: unknown) {
    super(`Review source ${source} cannot be mapped: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "ReviewMappingSourceError";
  }
}

/** Run one source's mapping step, naming that source in any failure it raises. */
export function mapReviewSource<T>(source: string, step: () => T): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof ReviewMappingSourceError) throw error;
    throw new ReviewMappingSourceError(source, error);
  }
}
