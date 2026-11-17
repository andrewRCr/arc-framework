/** Spelling of paths built from POSIX fixture roots, for in-memory fakes that key on POSIX paths. */

/**
 * Spell a path the code under test built from a POSIX fixture root such as `/repo` as the fixture wrote it. On
 * Windows, `node:path` turns `/repo` into `\repo` or `C:\repo`; this drops the drive and restores `/` separators, so a
 * fake keyed by `/repo/...` answers on every platform. POSIX paths pass through unchanged.
 */
export function fixturePath(path: string): string {
  return path.replace(/^[A-Za-z]:(?=[\\/])/u, "").replaceAll("\\", "/");
}
