/** Pure assembly of deterministic `git commit -m` message bytes. */

const encoder = new TextEncoder();

/**
 * Join message values as Git paragraphs and return their UTF-8 bytes.
 *
 * @param values - Ordered values supplied through `-m` / `--message`.
 * @returns The assembled commit-message bytes.
 */
export function assembleCommitMessageParagraphs(values: readonly string[]): Uint8Array {
  const lines = values
    .join("\n\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\r\f\v]+$/u, ""));

  while (lines[0] === "") lines.shift();
  while (lines.at(-1) === "") lines.pop();

  const cleaned: string[] = [];
  for (const line of lines) {
    if (line === "" && cleaned.at(-1) === "") continue;
    cleaned.push(line);
  }

  return cleaned.length === 0 ? new Uint8Array() : encoder.encode(`${cleaned.join("\n")}\n`);
}
