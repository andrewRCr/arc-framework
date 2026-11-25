/** Draw every difference between a held stampless save and the current stored text. */
import { diffIndices } from "node-diff3";
import type { SideLabel } from "../conflict.js";
import { createMarkerRenderer } from "./marker-render.js";

/** Retain the file's common lines and final-newline choice, drawing every differing span. */
export function drawCheckoutDifferences(input: {
  current: string; incoming: string; currentLabel: SideLabel; incomingLabel: SideLabel;
}): { content: string; length: number } {
  const current = lines(input.current), incoming = lines(input.incoming);
  const renderer = createMarkerRenderer([input.current, input.incoming]);
  const changed = diffIndices(current, incoming);
  const ranges = changed.length === 0 ? [{ buffer1: [0, current.length], buffer2: [0, incoming.length] }] : changed;
  const result: string[] = [];
  let cursor = 0;
  for (const range of ranges) {
    const [start = 0, count = 0] = range.buffer1;
    const [otherStart = 0, otherCount = 0] = range.buffer2;
    result.push(...incoming.slice(cursor, otherStart));
    result.push(...renderer.renderLines({ length: renderer.length,
      current: { lines: current.slice(start, start + count), label: input.currentLabel },
      incoming: { lines: incoming.slice(otherStart, otherStart + otherCount), label: input.incomingLabel } }, { shows: "checkout" }));
    cursor = otherStart + otherCount;
  }
  result.push(...incoming.slice(cursor));
  return { content: result.join("\n") + (input.incoming.endsWith("\n") ? "\n" : ""), length: renderer.length };
}

function lines(content: string): string[] {
  return content === "" ? [] : (content.endsWith("\n") ? content.slice(0, -1) : content).split("\n");
}
