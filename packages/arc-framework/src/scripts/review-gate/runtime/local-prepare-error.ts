/** Stable local preparation errors shared by fresh and replay admission. */

export class LocalPrepareCommandError extends Error {
  readonly code = "corrupt-state" as const;

  constructor(message: string) {
    super(message);
    this.name = "LocalPrepareCommandError";
  }
}
