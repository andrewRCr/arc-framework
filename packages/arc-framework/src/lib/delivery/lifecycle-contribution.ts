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
    readonly protectedBaseRef?: string;
    readonly controlRef?: string;
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

/** Exact normalized completeness comparison for a final disposable candidate tree. */
export function compareNormalizedDeliveryTree(input: {
  readonly protectedBase: DeliveryLifecycleTreeState;
  readonly control: DeliveryLifecycleTreeState;
  readonly finalCandidate: DeliveryLifecycleTreeState;
  readonly lifecyclePaths: readonly string[];
}):
  | { readonly status: "match" }
  | {
      readonly status: "mismatch";
      readonly droppedPaths: readonly string[];
      readonly inventedPaths: readonly string[];
      readonly mismatchedPaths: readonly string[];
    } {
  const expected = new Map(input.control);
  for (const path of input.lifecyclePaths) {
    const baseEntry = input.protectedBase.get(path);
    if (baseEntry == null) expected.delete(path);
    else expected.set(path, baseEntry);
  }
  const droppedPaths: string[] = [];
  const inventedPaths: string[] = [];
  const mismatchedPaths: string[] = [];
  const paths = [...new Set([...expected.keys(), ...input.finalCandidate.keys()])].sort(byteSort);
  for (const path of paths) {
    const expectedEntry = expected.get(path);
    const actualEntry = input.finalCandidate.get(path);
    if (expectedEntry === undefined && actualEntry !== undefined) inventedPaths.push(path);
    else if (expectedEntry !== undefined && actualEntry === undefined) droppedPaths.push(path);
    else if (!sameEntry(expectedEntry, actualEntry)) mismatchedPaths.push(path);
  }
  return droppedPaths.length === 0 && inventedPaths.length === 0 && mismatchedPaths.length === 0
    ? { status: "match" }
    : { status: "mismatch", droppedPaths, inventedPaths, mismatchedPaths };
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
    readonly readArtifactsAtRef?: (
      ref: string,
      workUnitId: string,
    ) => Promise<readonly ManagedPath[]>;
    readonly projectReadinessPath?: ManagedPath | null;
  }) {}

  async resolve(input: {
    readonly workUnitId: string;
    readonly activeMetaPath: ManagedPath;
    readonly protectedBaseRef?: string;
    readonly controlRef?: string;
  }): Promise<DeliveryLifecycleContributionPaths> {
    const currentArtifacts = await listCurrentWuArtifactPaths(
      input.workUnitId,
      input.activeMetaPath,
      this.input.readDirectory,
    );
    const refArtifacts = this.input.readArtifactsAtRef !== undefined
      && input.protectedBaseRef !== undefined
      && input.controlRef !== undefined
      ? await Promise.all([
          this.input.readArtifactsAtRef(input.protectedBaseRef, input.workUnitId),
          this.input.readArtifactsAtRef(input.controlRef, input.workUnitId),
        ])
      : [[], []] as const;
    const workUnitArtifacts = [...new Set([
      ...currentArtifacts.map(validateManagedPath),
      ...refArtifacts.flat(),
    ])].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    const projectReadinessPath = this.input.projectReadinessPath === undefined
      ? resolveArcPath({ kind: "project-document", document: "roadmap" })
      : this.input.projectReadinessPath;
    return {
      workUnitArtifacts,
      sharedProjections: projectReadinessPath === null ? [] : [projectReadinessPath],
    };
  }
}
