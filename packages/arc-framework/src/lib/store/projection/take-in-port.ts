/**
 * The take-in port: reading and replacing hand every edit they meet to it, and write-back answers once it is bound. Each
 * answer returns the file's entry as the take-in left it, since the index stays in memory until the batch writes it.
 */
import type { FileStat, RecordEntry, RefusedMark } from "./index-schema.js";

/** The base an edit is taken in against: a Markdown file's stamp, null where it carries none, or a stampless base. */
export type TakeInBase =
  | { readonly kind: "stamp"; readonly stamp: string | null }
  | { readonly kind: "blob"; readonly blob: string };

/** One edit handed to the port. */
export interface TakeInRequest {
  /** The worktree whose file holds the edit, whose edit rights apply rather than the writer's. */
  readonly checkout: string;
  /** The file's repository-relative path. */
  readonly path: string;
  /** The aside copy holding the edit, by its repository-relative location, or null for the file at its path. */
  readonly copy: string | null;
  readonly entry: RecordEntry;
  readonly base: TakeInBase;
}

/** What the take-in answered, with the entry as it left it. */
export type TakeInResult =
  | { readonly answer: "no-edit" | "deferred" | "pending" | "clashed"; readonly entry: RecordEntry }
  /**
   * The edit landed whole; `read` is the stat and blob id it read, which a later check of the file compares against.
   * For an aside copy, the entry records beside the copy the blob id it held, as `landed`.
   */
  | { readonly answer: "taken-in"; readonly entry: RecordEntry; readonly read: TakeInRead }
  | { readonly answer: "refused" | "unparseable"; readonly entry: RecordEntry; readonly mark: RefusedMark };

/** An answer that leaves the edit where it is: in the file, or in its aside copy. */
export type TakeInHeld = Exclude<TakeInResult["answer"], "no-edit" | "taken-in">;

/** The stat and blob id a take-in read. */
export interface TakeInRead {
  readonly stat: FileStat;
  readonly blob: string;
}

/** The port itself. */
export type TakeInPort = (request: TakeInRequest) => Promise<TakeInResult>;
