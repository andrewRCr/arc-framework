/** Pure decomposition fan-out blocks in existing cohort documents. */
export type CohortFanoutWriteResult =
  | { status: "appended" | "reused"; content: string }
  | { status: "refused"; reason: "conflicting-provenance" };

/** Append or reuse the origin's exact fan-out block in a cohort document. */
export function writeCohortFanout(document: string, origin: string, members: readonly string[]): CohortFanoutWriteResult {
  const ordered = [...members].sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  const start = `<!-- arc:decompose-fanout:${origin}:start -->`;
  const end = `<!-- arc:decompose-fanout:${origin}:end -->`;
  const block = [
    start,
    `### \`${origin}\` decomposition fan-out`,
    "",
    ...ordered.map(slug => `- \`${slug}\``),
    end,
  ].join("\n");
  if (document.includes(block)) return { status: "reused", content: document };
  if (document.includes(start) || document.includes(end)) return { status: "refused", reason: "conflicting-provenance" };
  return { status: "appended", content: appendBeforeFinalRule(document, block) };
}

function appendBeforeFinalRule(text: string, block: string): string {
  const finalRule = text.lastIndexOf("\n---");
  if (finalRule < 0) return `${text.trimEnd()}\n\n${block}\n`;
  return `${text.slice(0, finalRule).trimEnd()}\n\n${block}\n${text.slice(finalRule)}`
    .replace(/\n*$/u, "\n");
}
