/** Inspect link targets component by component without opening external source content. */
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import type { SourcePresentationIO } from "./source-io.js";
import type { BigIntStats } from "node:fs";
import { SourceCaptureError } from "./source-error.js";
import { decodeSourceText } from "./source-paths.js";

/** Decode a literal link target without replacing invalid UTF-8 or dropping a leading BOM. */
export function decodeSourceLinkTarget(bytes: Uint8Array): string {
  const target = decodeSourceText(bytes);
  if (target === "" || target.includes("\0")) throw new SourceCaptureError("Source link target is not representable");
  return target;
}

function inside(root: string, path: string): boolean {
  const name = relative(root, path);
  return !isAbsolute(name) && name !== ".." && !name.startsWith(`..${sep}`);
}

function components(target: string): string[] {
  if (isAbsolute(target) || parse(target).root !== "") throw new SourceCaptureError("Absolute source links cannot be relocated literally");
  return target.split(sep === "\\" ? /[\\/]/u : "/");
}

function absent(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function targetEntry(io: SourcePresentationIO, path: string): Promise<BigIntStats | undefined> {
  try { return await io.lstat(path); }
  catch (error) { if (absent(error)) return undefined; throw error; }
}

function targetPath(root: string, cursor: string, component: string): string {
  const path = resolve(cursor, component);
  if (!inside(root, path)) throw new SourceCaptureError("Source link escapes captured root");
  return path;
}

async function followLink(io: SourcePresentationIO, path: string, pending: string[], hops: number): Promise<string[]> {
  if (hops > 256) throw new SourceCaptureError("Source link chain cannot be established within a bounded capture");
  return [...components(decodeSourceLinkTarget(await io.readlink(path))), ...pending];
}

/** Certify linked prefixes as well as lexical containment, permitting contained dangling targets. */
export async function assertSourceLinkTarget(io: SourcePresentationIO, root: string,
  source: string, target: string): Promise<void> {
  const actualRoot = await io.realpath(root);
  let cursor = await io.realpath(dirname(source));
  let pending = components(target);
  const visited = new Set<string>();
  let hops = 0;
  while (pending.length > 0) {
    if (!inside(actualRoot, resolve(cursor, ...pending))) throw new SourceCaptureError("Source link escapes captured root");
    const state = JSON.stringify([cursor, pending]);
    if (visited.has(state)) return;
    visited.add(state);
    const path = targetPath(actualRoot, cursor, pending.shift() ?? "");
    const entry = await targetEntry(io, path);
    if (entry === undefined) return;
    if (entry.isSymbolicLink()) {
      pending = await followLink(io, path, pending, ++hops);
      cursor = dirname(path);
    } else cursor = path;
  }
}
