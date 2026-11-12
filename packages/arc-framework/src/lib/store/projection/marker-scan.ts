/** Scan exact-length marker controls before any record or entry parsing. */
import { RESOLVE_BY_HAND_LINE } from "./marker-render.js";

/** Raw sides and source offsets of one complete marker set. */
export interface MarkerSetSpan {
  readonly start: number;
  readonly end: number;
  readonly opening: string;
  readonly current: string;
  readonly incoming: string;
}

/** An incomplete set or an instruction left outside its generated position. */
export interface MalformedMarkerSpan {
  readonly start: number;
  readonly end: number;
  readonly opening?: string;
  readonly complete?: boolean;
}

interface ActiveSet { start: number; body: number; opening: string; separator?: { start: number; end: number } }
interface Scan { sets: MarkerSetSpan[]; malformed: MalformedMarkerSpan[]; controls: { start: number; end: number }[] }

/** Locate sets and incomplete controls, preserving offsets into the normalized input. */
export function scanMarkers(content: string, length: number): Scan {
  const result: Scan = { sets: [], malformed: [], controls: [] };
  const pattern = new RegExp(`^([<=>|])\\1{${length - 1}}(?!\\1)(?:[ \\t](.*))?$`, "u");
  let active: ActiveSet | undefined;
  for (const line of content.matchAll(/[^\n]+\n?|\n/gu)) {
    const value = line[0].replace(/\n$/u, "");
    const control = pattern.exec(value);
    const end = line.index + line[0].length;
    if (value === RESOLVE_BY_HAND_LINE) {
      result.controls.push({ start: line.index, end });
      if (active?.body !== line.index || length <= 7) result.malformed.push({ start: line.index, end });
    }
    if (control === null) continue;
    result.controls.push({ start: line.index, end });
    active = advanceSet(result, active, control, line.index, end, content);
  }
  if (active !== undefined) result.malformed.push({ start: active.start, end: content.length, opening: active.opening });
  return result;
}

/** Locate complete sets for callers deciding which indexed conflict records to read. */
export function scanMarkerSets(content: string, length: number): readonly MarkerSetSpan[] {
  return scanMarkers(content, length).sets;
}

function advanceSet(result: Scan, active: ActiveSet | undefined, control: RegExpExecArray, start: number, end: number, content: string): ActiveSet | undefined {
  const char = control[1];
  if (char === "<") {
    if (active !== undefined) result.malformed.push({ start: active.start, end: start, opening: active.opening });
    return { start, body: end, opening: control[2] ?? "" };
  }
  if (char === "=" && active !== undefined && active.separator === undefined && control[2] === undefined) {
    return { ...active, separator: { start, end } };
  }
  if (char === ">" && active?.separator !== undefined) {
    result.sets.push({ start: active.start, end, opening: active.opening,
      current: content.slice(active.body, active.separator.start), incoming: content.slice(active.separator.end, start) });
    return undefined;
  }
  result.malformed.push({ start: active?.start ?? start, end, ...(active === undefined ? {} : { opening: active.opening }) });
  return undefined;
}
