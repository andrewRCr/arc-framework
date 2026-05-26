/**
 * Pure sync-class classifier for user-directory paths. Infers a path's sync
 * class from its structure alone — no filename allowlist, no in-band class
 * declaration. The single source of truth for the per-WU / cross-WU /
 * never-synced semantic, consumed on the load side (per-WU subdir restore and
 * cross-WU entry merge); the save side stays class-agnostic.
 *
 * This is a separate axis from the file-*type* allowlist in
 * `lib/git/user-sync.ts` (`isAllowedFile`), which decides whether a file
 * serializes at all. The io-layer dotfile skip on the serialize walk is a
 * cheap walk-time prefilter, not a competing class authority — never-synced
 * paths never reach a manifest, but the classifier still names them so callers
 * have one place to ask.
 *
 * @module
 */

/** Sync class of a user-directory path, inferred from path structure alone. */
export type UserSyncClass = "per-wu" | "cross-wu" | "never-synced";

/**
 * Classify a user-directory path's sync class from its structure.
 *
 * Pure first-segment inference over a manifest-relative path (relative to
 * `user/{identity}/`, POSIX `/` separators per the serialize manifest):
 *
 * - dot-prefixed first segment → `never-synced` (framework bookkeeping —
 *   `.internal/**` plus any root-level dotfile; mirrors the serialize-walk
 *   dotfile prefilter, which drops dot-prefixed dirs and dotfile basenames, so
 *   the class boundary and the prefilter agree rather than carving out only
 *   `.internal/`)
 * - any remaining subdir path (`<wu-name>/…`, incl. nested) → `per-wu`, keyed
 *   on the leading subdir as the work-unit name
 * - any remaining flat path → `cross-wu` — *every* flat identity-root file,
 *   not an allowlisted shape; the cross-WU merge keys on filename, the class
 *   does not
 *
 * The never-synced check precedes the flat-file rule so dotfiles at the
 * identity root resolve to never-synced rather than cross-WU.
 *
 * @param manifestPath - Manifest-relative path under `user/{identity}/`.
 * @returns The path's sync class; total over all input strings.
 */
export function classifyUserSyncPath(manifestPath: string): UserSyncClass {
  const firstSegment = manifestPath.split("/", 1)[0] ?? "";

  if (firstSegment.startsWith(".")) return "never-synced";

  return manifestPath.includes("/") ? "per-wu" : "cross-wu";
}
