/** Node wiring that supplies real evidence to the partial-Errand settlement composition. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import type { GitExec } from "../git/exec.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { createLocusMutationResult, popOwnedLocusRole, validateOwnedLocusRole } from "../locus/mutation.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { readLocusState } from "../locus/reader.js";
import type { LocusMutationResultV1, LocusStateV1 } from "../locus/schema/index.js";
import { pinGroomOpenedBaseHead } from "./identity-claims.js";
import type { LockedLocusGenerationAcquisition } from "./locked-generation.js";
import {
  settlePartialErrand,
  type PartialErrandInboxSettlement,
} from "./partial-settle.js";

export type { PartialErrandInboxSettlement } from "./partial-settle.js";

export interface SettlePartialErrandRuntimeOptions {
  readonly slug: string;
  readonly action: "close" | "abandon";
  readonly base: string;
  readonly cwd: string;
  readonly identity: string;
  readonly identityGlobalUserDir: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly exec: GitExec;
  readonly settleInbox: (binding: {
    readonly originEntry: string | null;
    readonly parentCheckoutPath: string | null;
  }) => Promise<PartialErrandInboxSettlement>;
}

/** Prove one direct-base result, settle its capture binding, and pop the exact live role. */
export async function settlePartialErrandAtRuntime(
  options: SettlePartialErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const operation = options.action === "close" ? "errand-close" : "errand-abandon";
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") {
    return createLocusMutationResult({
      outcome: "refused", operation, reason: "lease-unknown", recommendedPromptText: anchor.reason,
    });
  }
  const inspector = createPlatformProcessInspector();
  const expectedSubject = { kind: "partial-errand" as const, key: options.slug, claimId: null };

  return settlePartialErrand({
    slug: options.slug,
    action: options.action,
    dependencies: {
      readState: () => readRuntimeState(options, anchor, inspector),
      pinBaseHead: () => pinGroomOpenedBaseHead(options.exec, { remote: "origin", baseRef: options.base }),
      verifyBase: (checkoutPath, expectedHead) =>
        verifyExactBase(options.exec, checkoutPath, options.base, expectedHead),
      acquireLock: async (target): Promise<LockedLocusGenerationAcquisition> => {
        const runtime = createNodeProvisioningDependencies({
          exec: options.exec,
          identity: options.identity,
          anchor,
          inspector,
          pathFlavor: process.platform === "win32" ? "windows" : "posix",
          base: options.base,
          branch: null,
          postCreateScript: options.postCreateScript,
          registeredHarnessDirs: options.registeredHarnessDirs,
        });
        const acquired = await runtime.acquireRecordLock(target.checkoutPath);
        if (acquired.kind !== "acquired") return acquired;
        const read = () => runtime.readRecord(acquired.handle.recordPath, acquired.handle);
        const expectations = {
          recordId: target.recordId,
          checkoutPath: target.checkoutPath,
          expectedSubject,
          expectedLeaseId: target.leaseId,
          enteringAnchor: anchor,
        };
        return {
          kind: "acquired",
          generation: {
            validate: async () => validateOwnedLocusRole(await read(), expectations),
            pop: () => popOwnedLocusRole({
              ...expectations,
              operation,
              recommendedPromptText: "Partial Errand occupancy removed.",
              io: {
                read,
                remove: (bytes) => runtime.removeRecord(acquired.handle.recordPath, bytes, acquired.handle),
              },
            }),
          },
          release: () => runtime.releaseRecordLock(acquired.handle),
        };
      },
      settleInbox: options.settleInbox,
    },
  });
}

async function readRuntimeState(
  options: SettlePartialErrandRuntimeOptions,
  anchor: Extract<Awaited<ReturnType<typeof acquireSessionAnchor>>, { kind: "process" }>,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<LocusStateV1> {
  return readLocusState({
    identity: options.identity,
    pathFlavor: process.platform === "win32" ? "windows" : "posix",
    evidenceIO: createLocusEvidenceIO({ exec: options.exec, identity: options.identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: async (path) => access(path).then(() => true, () => false),
      realpath,
      lstat,
    },
    identityGlobalUserDir: options.identityGlobalUserDir,
    enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({
      primaryPath: path,
      baseBranch: options.base,
      exec: options.exec,
    }),
  });
}

async function verifyExactBase(exec: GitExec, cwd: string, base: string, expectedHead: string): Promise<string | null> {
  try {
    const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })).stdout.trim();
    const head = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
    const dirty = (await exec("git", ["status", "--porcelain"], { cwd })).stdout;
    return branch === base && head === expectedHead && dirty === ""
      ? null
      : "Partial Errand checkout is dirty, off the configured base, or not at its freshly pushed head.";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
