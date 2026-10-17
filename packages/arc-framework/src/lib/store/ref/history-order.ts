/** Deterministic commit ordering shared by record history and saved-state intervals. */

/** One commit and its ordered Git parents. */
export interface HistoryCommit { revision: string; parents: string[] }

/** Parse Git's exact commit and parent identities without relying on traversal side order. */
export function parseHistoryRows(stdout: string): HistoryCommit[] {
  return stdout.trim().split("\n").filter(Boolean).map((line) => {
    const [revision, ...parents] = line.split(" ");
    if (!revision || ![revision, ...parents].every((oid) => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(oid))) throw new Error("Malformed Git history response");
    return { revision, parents };
  });
}

/** Return newest-first commits whose reverse visits the local side before the remote side. */
export function orderHistoryCommits(rows: readonly HistoryCommit[]): HistoryCommit[] {
  const byId = new Map(rows.map((row) => [row.revision, row]));
  const seen = new Set<string>();
  const ordered: HistoryCommit[] = [];
  const stack = rows.map((row) => ({ row, closing: false })).reverse();
  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) throw new Error("An active history traversal has no frame");
    if (frame.closing) { ordered.push(frame.row); continue; }
    if (seen.has(frame.row.revision)) continue;
    seen.add(frame.row.revision);
    stack.push({ row: frame.row, closing: true });
    for (const parent of [...frame.row.parents].reverse()) {
      const row = byId.get(parent);
      if (row) stack.push({ row, closing: false });
    }
  }
  return ordered.reverse();
}
