/** Canonical, byte-preserving facts derived from Git raw-diff output. */

export type ChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "type-changed";

export interface CanonicalChange {
  status: ChangeStatus;
  path: string;
  previousPath?: string;
  oldMode: string;
  newMode: string;
}

export type ChangeSet =
  | { changeSet: "known"; changes: CanonicalChange[] }
  | { changeSet: "unknown"; changes: [] };

/** Result from a byte-preserving Git invocation. */
export interface RawGitResult {
  stdout: Uint8Array;
  stderr?: Uint8Array;
}

/** Narrow Git boundary for commands whose NUL-framed output must remain bytes. */
export type RawGitExec = (
  args: string[],
  options?: { cwd?: string },
) => Promise<RawGitResult>;

const UNKNOWN: ChangeSet = { changeSet: "unknown", changes: [] };
const decoder = new TextDecoder("utf-8", { fatal: true });
const STATUS = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type-changed",
} as const;

function splitNul(input: Uint8Array): Uint8Array[] | null {
  if (input.length === 0 || input.at(-1) !== 0) return null;

  const fields: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== 0) continue;
    fields.push(input.subarray(start, index));
    start = index + 1;
  }
  return fields;
}

/**
 * Parse `git diff --raw -z --no-abbrev` output into the canonical change record.
 *
 * @param input - Exact bytes emitted by Git
 * @returns A known record only when every raw-diff entry is valid
 */
export function parseRawDiff(input: Uint8Array): ChangeSet {
  const fields = splitNul(input);
  if (fields === null || fields.length === 0) return UNKNOWN;

  try {
    const changes: CanonicalChange[] = [];
    let objectWidth: number | undefined;
    let cursor = 0;

    while (cursor < fields.length) {
      const header = decoder.decode(fields[cursor]);
      cursor += 1;
      const match =
        /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) ([AMDT]|[RC][0-9]{1,3})$/u.exec(header);
      if (match === null) return UNKNOWN;

      const [, oldMode, newMode, oldObject, newObject, rawStatusWithScore] = match;
      if (
        oldMode === undefined ||
        newMode === undefined ||
        oldObject === undefined ||
        newObject === undefined ||
        rawStatusWithScore === undefined ||
        oldObject.length !== newObject.length ||
        (oldObject.length !== 40 && oldObject.length !== 64) ||
        (objectWidth !== undefined && oldObject.length !== objectWidth)
      ) {
        return UNKNOWN;
      }
      objectWidth = oldObject.length;

      const rawStatus = rawStatusWithScore[0] as keyof typeof STATUS;
      const hasPreviousPath = rawStatus === "R" || rawStatus === "C";
      if (hasPreviousPath && Number(rawStatusWithScore.slice(1)) > 100) return UNKNOWN;

      const firstPathBytes = fields[cursor];
      if (firstPathBytes === undefined) return UNKNOWN;
      cursor += 1;
      const firstPath = decoder.decode(firstPathBytes);
      if (firstPath.length === 0) return UNKNOWN;

      let previousPath: string | undefined;
      let path = firstPath;
      if (hasPreviousPath) {
        const secondPathBytes = fields[cursor];
        if (secondPathBytes === undefined) return UNKNOWN;
        cursor += 1;
        previousPath = firstPath;
        path = decoder.decode(secondPathBytes);
        if (path.length === 0) return UNKNOWN;
      }

      changes.push({
        status: STATUS[rawStatus],
        path,
        ...(previousPath === undefined ? {} : { previousPath }),
        oldMode,
        newMode,
      });
    }

    return changes.length === 0 ? UNKNOWN : { changeSet: "known", changes };
  } catch {
    return UNKNOWN;
  }
}
