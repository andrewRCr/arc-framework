/** Source-preserving wrapping units for Markdown prose and underwrap diagnostics. */

/** One wrapping unit and its offsets in the original JavaScript string. */
export interface ProseAtom {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function escaped(source: string, offset: number): boolean {
  let slashes = 0;
  for (let index = offset - 1; index >= 0 && source[index] === "\\"; index -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function codeSpans(source: string): ReadonlyMap<number, number> {
  const runs = [...source.matchAll(/`+/gu)];
  const next = new Map<number, number>();
  const closing = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (run === undefined) continue;
    const match = next.get(run[0].length);
    if (match !== undefined) closing.set(index, match);
    next.set(run[0].length, index);
  }
  const spans = new Map<number, number>();
  for (let index = 0; index < runs.length; index += 1) {
    const opening = runs[index];
    const closeIndex = closing.get(index);
    const close = closeIndex === undefined ? undefined : runs[closeIndex];
    if (opening === undefined || close === undefined || escaped(source, opening.index)) continue;
    spans.set(opening.index, close.index + close[0].length);
    index = closeIndex ?? index;
  }
  return spans;
}

function words(source: string): ProseAtom[] {
  const spans = codeSpans(source);
  const result: ProseAtom[] = [];
  let offset = 0;
  while (offset < source.length) {
    if (/[ \t\r\n]/u.test(source[offset] ?? "")) { offset += 1; continue; }
    const start = offset;
    while (offset < source.length && !/[ \t\r\n]/u.test(source[offset] ?? "")) {
      offset = spans.get(offset) ?? offset + 1;
    }
    result.push({ start, end: offset, text: source.slice(start, offset) });
  }
  return result;
}

/** Keep code spans, section references, and significant horizontal spacing indivisible. */
export function proseAtoms(source: string): readonly ProseAtom[] {
  const result: ProseAtom[] = [];
  for (const atom of words(source)) {
    const previous = result.at(-1);
    const gap = previous === undefined ? "" : source.slice(previous.end, atom.start);
    const section = previous?.text.endsWith("\u00a7") === true && /^\d/u.test(atom.text);
    const significantGap = gap !== " " && gap !== "" && !/[\r\n]/u.test(gap);
    if (previous !== undefined && (section || significantGap)) {
      result[result.length - 1] = {
        start: previous.start, end: atom.end,
        text: previous.text + (section && /[\r\n]/u.test(gap) ? " " : gap) + atom.text,
      };
    } else result.push(atom);
  }
  return result;
}

/** Return the next movable source unit at each soft physical-line boundary. */
export function nextLineProseAtoms(lines: readonly string[]): readonly (string | undefined)[] {
  const source = lines.join("\n");
  const atoms = proseAtoms(source);
  let offset = 0;
  let cursor = 0;
  return lines.slice(0, -1).map((line) => {
    offset += line.length + 1;
    while (cursor < atoms.length && (atoms[cursor]?.end ?? 0) <= offset) cursor += 1;
    const atom = atoms[cursor];
    if (atom === undefined || (atom.start < offset && /[\r\n]/u.test(atom.text))) return undefined;
    return (atom.start < offset ? source.slice(offset, atom.end).trim() : atom.text).split(/\r\n|\r|\n/u)[0];
  });
}
