/** Resolve and compare repository paths carrying one work unit's lifecycle contribution. */

import { validateManagedPath, type ManagedPath } from "../kernel/index.js";
import { resolveArcPath } from "../layout/index.js";
import { listCurrentWuArtifactPaths } from "../work-unit/reference-reconcile.js";

/** Repository paths through which one work unit can contribute lifecycle state. */
export interface DeliveryLifecycleContributionPaths {
  readonly workUnitArtifacts: readonly ManagedPath[];
  readonly sharedProjections: readonly ManagedPath[];
}

/** Storage/projection boundary for repository-materialized lifecycle contributions. */
export interface DeliveryLifecycleContributionPathSource {
  resolve(input: {
    readonly workUnitId: string;
    readonly activeMetaPath: ManagedPath;
  }): Promise<DeliveryLifecycleContributionPaths>;
}

/** Exact identity of one repository tree entry. */
export interface DeliveryLifecycleTreeEntry {
  readonly mode: string;
  readonly type: string;
  readonly oid: string;
}

/** Exact entry state for all lifecycle-contribution paths at one tree. */
export type DeliveryLifecycleTreeState = ReadonlyMap<string, DeliveryLifecycleTreeEntry | null>;

/** Result of comparing candidate lifecycle contribution against the protected base. */
export interface DeliveryLifecycleContributionComparison {
  readonly status: "match" | "mismatch";
  readonly mismatchedPaths: readonly string[];
}

/** Compare exact entry identities only at the supplied lifecycle-contribution paths. */
export function compareDeliveryLifecycleContribution(_input: {
  readonly paths: readonly string[];
  readonly protectedBase: DeliveryLifecycleTreeState;
  readonly candidate: DeliveryLifecycleTreeState;
}): DeliveryLifecycleContributionComparison {
  const mismatchedPaths = [...new Set(_input.paths)]
    .filter((path) => !sameEntry(_input.protectedBase.get(path), _input.candidate.get(path)))
    .sort(byteSort);
  return mismatchedPaths.length === 0
    ? { status: "match", mismatchedPaths }
    : { status: "mismatch", mismatchedPaths };
}

function sameEntry(
  left: DeliveryLifecycleTreeEntry | null | undefined,
  right: DeliveryLifecycleTreeEntry | null | undefined,
): boolean {
  if (left == null || right == null) return left == null && right == null;
  return left.mode === right.mode && left.type === right.type && left.oid === right.oid;
}

function byteSort(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

/** Current in-repository implementation of the lifecycle-contribution path boundary. */
export class CurrentDeliveryLifecycleContributionPathSource
implements DeliveryLifecycleContributionPathSource {
  constructor(private readonly input: {
    readonly readDirectory: (path: string) => Promise<readonly string[]>;
    readonly projectReadinessPath?: ManagedPath | null;
  }) {}

  async resolve(input: {
    readonly workUnitId: string;
    readonly activeMetaPath: ManagedPath;
  }): Promise<DeliveryLifecycleContributionPaths> {
    const workUnitArtifacts = await listCurrentWuArtifactPaths(
      input.workUnitId,
      input.activeMetaPath,
      this.input.readDirectory,
    );
    const projectReadinessPath = this.input.projectReadinessPath === undefined
      ? resolveArcPath({ kind: "project-document", document: "roadmap" })
      : this.input.projectReadinessPath;
    return {
      workUnitArtifacts: workUnitArtifacts.map(validateManagedPath),
      sharedProjections: projectReadinessPath === null ? [] : [projectReadinessPath],
    };
  }
}
