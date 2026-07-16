/**
 * Git/filesystem binding for the abandon retirement driver.
 *
 * The binding captures the committed source artifact group before removal,
 * limits staging to that group plus the generated readiness view, and composes
 * the in-repository snapshot/record operations behind the authority port.
 */

import { posix } from "node:path";

import { canonicalize } from "../canonical/canonical-json.js";
import {
  contentDigest,
  deleteOperation,
  writeOperation,
  type ArtifactSetEntry,
  type PatchOperation,
} from "../canonical/content-digest.js";
import { artifactGroupDigest, receiptId } from "../canonical/receipt-id.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import { getCurrentBranch, type GitExec } from "../git/exec.js";
import {
  validateReceiptMatrix,
  type RetirementAuthorityScope,
  type RetirementReceipt,
} from "./retirement-authority.js";
import { readRetirementAuthoritySnapshot } from "./retirement-authority-snapshot.js";
import { recordRetirementReceipt } from "./retirement-record.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import type {
  AbandonRetirementContext,
  AbandonSourceEvidence,
} from "./verbs/abandon.js";

const ROADMAP_PATH = validateManagedPath(".arc/backlog/ROADMAP.md");

/** Exact Git blob reader; a null ref addresses the current index. */
export type RetirementBlobReader = (
  ref: string | null,
  path: ManagedPath,
) => Promise<Uint8Array | null>;

/** Production boundaries needed by the in-repository abandon binding. */
export interface InRepoAbandonRetirementDeps {
  cwd: string;
  exec: GitExec;
  readBlob: RetirementBlobReader;
  readFile(path: string): Promise<string>;
  createRecord(receiptId: RetirementReceipt["receiptId"], content: string): Promise<void>;
  removeRecord(receiptId: RetirementReceipt["receiptId"]): Promise<void>;
}

interface CapturedAbandonSource extends AbandonSourceEvidence {
  inventory: readonly ArtifactSetEntry[];
}

interface SnapshotBinding {
  scope: RetirementAuthorityScope;
  source: CapturedAbandonSource;
  authorityVersion: string;
}

/**
 * Build the direct-transition evidence and authority seams used by `runAbandon`.
 *
 * @param deps - Repository Git, blob, and record-storage boundaries
 * @returns An abandon retirement context bound to one repository checkout
 */
export function createInRepoAbandonRetirementContext(
  deps: InRepoAbandonRetirementDeps,
): AbandonRetirementContext {
  let captured: CapturedAbandonSource | null = null;
  const snapshots = new Map<string, SnapshotBinding>();

  const captureSource: AbandonRetirementContext["captureSource"] = async ({ name, sourceDir, expectedBranch }) => {
    const branch = await getCurrentBranch(deps.exec);
    if (branch === null) throw new Error("abandon retirement evidence requires an attached source branch");
    if (expectedBranch !== null && expectedBranch !== "[none]" && branch !== expectedBranch) {
      throw new Error(`abandon must run from the source branch \`${expectedBranch}\`, not \`${branch}\``);
    }
    const head = await resolveRef(deps.exec, deps.cwd, branch);
    const paths = await listArtifactPaths(deps.exec, deps.cwd, head, sourceDir, name);
    const inventory = await Promise.all(paths.map(async (path): Promise<ArtifactSetEntry> => {
      const bytes = await deps.readBlob(head, path);
      if (bytes === null) throw new Error(`source artifact disappeared from ${head}: ${path}`);
      return { path, state: "present", contentDigest: contentDigest(bytes) };
    }));
    const evidence: CapturedAbandonSource = {
      scope: {
        subject: { kind: "work-unit", name },
        transition: "abandon",
        source: { branch, head },
        resultProjection: { ref: branch, head },
      },
      artifactDigest: artifactGroupDigest(inventory),
      sourceArtifactPaths: paths,
      inventory,
    };
    captured = evidence;
    return evidence;
  };

  const readTransitionPatch = async (source: AbandonSourceEvidence): Promise<readonly PatchOperation[]> => {
    const bound = requireCaptured(captured, source);
    const operations: PatchOperation[] = [];
    for (const path of bound.sourceArtifactPaths) {
      if (await deps.readBlob(null, path) !== null) {
        throw new Error(`abandon transition left source artifact in the index: ${path}`);
      }
      operations.push(deleteOperation(path));
    }

    const [beforeRoadmap, afterRoadmap] = await Promise.all([
      deps.readBlob(bound.scope.source.head, ROADMAP_PATH),
      deps.readBlob(null, ROADMAP_PATH),
    ]);
    if (!bytesEqual(beforeRoadmap, afterRoadmap)) {
      if (afterRoadmap === null) operations.push(deleteOperation(ROADMAP_PATH));
      else operations.push(writeOperation(ROADMAP_PATH, afterRoadmap));
    }
    return operations;
  };

  const authority: AbandonRetirementContext["authority"] = {
    readSnapshot: async (scope) => {
      const source = requireCaptured(captured, { scope });
      const staged = await readStagedPaths(deps.exec, deps.cwd);
      if (staged.length > 0) return { status: "refused", reason: "evidence-mismatch" };
      const result = await readRetirementAuthoritySnapshot(
        {
          cwd: deps.cwd,
          exec: deps.exec,
          fs: { readFile: (path) => deps.readFile(path) },
          readInventory: () => Promise.resolve(source.inventory),
        },
        scope,
      );
      if (result.status === "resolved") {
        snapshots.set(result.snapshot.authorityVersion, {
          scope,
          source,
          authorityVersion: result.snapshot.authorityVersion,
        });
      }
      return result;
    },
    record: async (receipt, expectedAuthorityVersion) => {
      const binding = snapshots.get(expectedAuthorityVersion);
      if (binding === undefined || !receiptMatchesBinding(receipt, binding)) {
        return { status: "refused", reason: "authority-conflict" };
      }
      return await recordRetirementReceipt(
        {
          cwd: deps.cwd,
          readAuthorityVersion: async () => {
            const [sourceOid, resultOid, branch] = await Promise.all([
              resolveRef(deps.exec, deps.cwd, binding.scope.source.branch),
              resolveRef(deps.exec, deps.cwd, binding.scope.resultProjection.ref),
              getCurrentBranch(deps.exec),
            ]);
            return sourceOid === binding.scope.source.head
              && resultOid === binding.scope.resultProjection.head
              && branch === binding.scope.source.branch
              ? binding.authorityVersion
              : `${binding.authorityVersion}:conflict`;
          },
          readStagedPaths: () => readStagedPaths(deps.exec, deps.cwd),
          readTransitionPatch: () => readTransitionPatch(binding.source),
          createRecord: (receiptId, content) => deps.createRecord(receiptId, content),
          removeRecord: (receiptId) => deps.removeRecord(receiptId),
          stagePaths: async (paths) => {
            const alreadyStaged = new Set(await readStagedPaths(deps.exec, deps.cwd));
            await stagePaths(
              deps.exec,
              deps.cwd,
              paths.filter((path) => !alreadyStaged.has(path)),
            );
          },
        },
        receipt,
        expectedAuthorityVersion,
      );
    },
  };

  return {
    authority,
    captureSource,
    stageTransition: async (source) => {
      const bound = requireCaptured(captured, source);
      await stagePaths(deps.exec, deps.cwd, [...bound.sourceArtifactPaths, ROADMAP_PATH]);
    },
    readTransitionPatch,
  };
}

function requireCaptured(
  captured: CapturedAbandonSource | null,
  source: Pick<AbandonSourceEvidence, "scope">,
): CapturedAbandonSource {
  if (captured === null || canonicalScope(captured.scope) !== canonicalScope(source.scope)) {
    throw new Error("abandon retirement source does not match the captured projection");
  }
  return captured;
}

function canonicalScope(scope: RetirementAuthorityScope): string {
  return canonicalize(scope);
}

function receiptMatchesBinding(receipt: RetirementReceipt, binding: SnapshotBinding): boolean {
  return receipt.transition === "abandon"
    && receipt.receiptId === receiptId({
      schemaVersion: receipt.schemaVersion,
      subject: receipt.subject,
      transition: receipt.transition,
      sourceBranch: receipt.source.branch,
      sourceHead: receipt.source.head,
    })
    && receipt.source.branch === binding.scope.source.branch
    && receipt.source.head === binding.scope.source.head
    && receipt.source.artifactDigest === binding.source.artifactDigest
    && receipt.retiringProjection.kind === "direct-transition"
    && validateReceiptMatrix(receipt, "nonexistent") === null
    && receipt.subject.kind === "work-unit"
    && binding.scope.subject.kind === "work-unit"
    && receipt.subject.name === binding.scope.subject.name;
}

async function resolveRef(exec: GitExec, cwd: string, ref: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd });
  const oid = stdout.trim();
  if (oid === "") throw new Error(`could not resolve commit: ${ref}`);
  return oid;
}

async function listArtifactPaths(
  exec: GitExec,
  cwd: string,
  ref: string,
  sourceDir: string,
  name: string,
): Promise<ManagedPath[]> {
  const { stdout } = await exec(
    "git",
    ["ls-tree", "--full-tree", "-r", "-z", "--name-only", ref, "--", sourceDir],
    { cwd },
  );
  const matcher = artifactMatcher(name);
  return stdout
    .split("\0")
    .filter((path) => path !== "" && posix.dirname(path) === sourceDir && matcher.test(posix.basename(path)))
    .map(validateManagedPath)
    .sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
}

async function readStagedPaths(exec: GitExec, cwd: string): Promise<string[]> {
  const { stdout } = await exec("git", ["diff", "--cached", "--name-only", "-z"], { cwd });
  return stdout.split("\0").filter((path) => path !== "");
}

async function stagePaths(exec: GitExec, cwd: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await exec("git", ["add", "-A", "--", ...paths], { cwd });
}

function bytesEqual(left: Uint8Array | null, right: Uint8Array | null): boolean {
  if (left === null || right === null) return left === right;
  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}
