/** Pure occupancy facts shared by archive writers and whole-quarter composition. */

/** Find an existing file, folder claim or descendant occupying a complete archive root. */
export function findArchiveRootOccupant(root: string, paths: Iterable<string>): string | undefined {
  for (const path of paths) if (path === root.slice(0, -1) || path.startsWith(root)) return path;
  return undefined;
}
