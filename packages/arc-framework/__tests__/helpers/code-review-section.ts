/** Follow a real workflow reference to the shared code-review contract in content tests. */
import { strict as assert } from "node:assert";

/** Require a used fragment-bearing method link, then return only that section and its nested sections. */
export function codeReviewSection(workflow: string, fragment: string, method: string): string {
  const references = [...workflow.matchAll(/^\[([^\]]+)\]:\s+(\S+)/gmu)];
  const reference = references.find(entry => entry[2]?.endsWith(`/methods/code-review.md#${fragment}`));
  assert(reference !== undefined, `missing code-review link for ${fragment}`);
  const body = workflow.slice(0, references[0]?.index ?? workflow.length);
  assert(body.includes(`[${reference[1]}]`), `unused code-review link for ${fragment}`);
  const lines = method.split("\n");
  const start = lines.findIndex(line => /^#{3,4} /u.test(line)
    && line.replace(/^#+ /u, "").toLowerCase().replaceAll(" ", "-") === fragment);
  assert(start >= 0, `missing code-review section ${fragment}`);
  const level = lines[start]!.match(/^#+/u)![0].length;
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end]!;
    const heading = line.match(/^(#+) /u);
    if (line === "---" || (heading !== null && heading[1]!.length <= level)) break;
    end += 1;
  }
  return lines.slice(start, end).join("\n");
}
