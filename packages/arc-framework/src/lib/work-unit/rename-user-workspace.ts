/**
 * Filesystem state machine for moving a work unit's per-identity workspace.
 *
 * The operation preserves the directory as a unit, including session notes,
 * and classifies resume states before any mutation.
 *
 * @module
 */

/** Filesystem boundary for the workspace directory move. */
export interface RenameUserWorkspaceFs {
  directoryExists(path: string): Promise<boolean>;
  renameDirectory(source: string, destination: string): Promise<void>;
}

/** Source and destination directories for a workspace rename. */
export interface RenameUserWorkspacePaths {
  source: string;
  destination: string;
}

/** Result of reconciling the workspace's directory identity. */
export type RenameUserWorkspaceDirectoryResult =
  | { status: "moved" }
  | { status: "already-moved" }
  | { status: "absent" };

/**
 * Move the old workspace directory, accept its post-state, or skip an absent
 * workspace. A split state refuses rather than choosing between note sets.
 *
 * @param fs - Filesystem seam
 * @param paths - Old and new workspace directories
 * @returns The observed or applied directory state
 */
export async function reconcileRenameUserWorkspaceDirectory(
  fs: RenameUserWorkspaceFs,
  paths: RenameUserWorkspacePaths,
): Promise<RenameUserWorkspaceDirectoryResult> {
  const [sourcePresent, destinationPresent] = await Promise.all([
    fs.directoryExists(paths.source),
    fs.directoryExists(paths.destination),
  ]);

  if (sourcePresent && destinationPresent) {
    throw new Error(
      `cannot rename user workspace while both directories exist: ${paths.source}, ${paths.destination}`,
    );
  }
  if (destinationPresent) return { status: "already-moved" };
  if (!sourcePresent) return { status: "absent" };

  await fs.renameDirectory(paths.source, paths.destination);
  return { status: "moved" };
}
