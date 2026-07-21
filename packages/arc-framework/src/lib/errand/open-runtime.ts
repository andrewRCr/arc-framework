/** Production authority, reader, and provisioning composition for ordinary Errand open. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import type { GitExecInput } from "../git/exec.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { provisionTransientLocus } from "../locus/provisioning.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { readLocusState } from "../locus/reader.js";
import {
  createPlatformProcessAncestryInspector,
  createPlatformProcessInspector,
} from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import type { LocusMutationResultV1, LocusProcessAnchor } from "../locus/schema/index.js";
import type { GitExec } from "../git/exec.js";
import { rollbackIdentityClaim } from "./identity-claims.js";
import { ordinaryErrandTransform } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";
import { openOrdinaryErrand } from "./open.js";

export interface OpenOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly intent?: string;
  readonly originEntry: string | null;
  readonly dispatchId: string | null;
  readonly protection: "full" | "partial";
  readonly base: string;
  readonly createdAt: string;
  readonly identity: string;
  readonly locationTemplate: string;
  readonly repo: string;
  readonly leaseId: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly identityGlobalUserDir: string;
  readonly activeExtensions: readonly string[];
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
}

/** Run the complete production ordinary-Errand open composition. */
export async function openOrdinaryErrandAtRuntime(
  options: OpenOrdinaryErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const inspector = createPlatformProcessInspector();
  const ancestry = createPlatformProcessAncestryInspector();
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  let selectedAnchor: LocusProcessAnchor | null = null;
  return openOrdinaryErrand({
    slug: options.slug,
    intent: options.intent,
    originEntry: options.originEntry,
    dispatchId: options.dispatchId,
    protection: options.protection,
    base: options.base,
    createdAt: options.createdAt,
    identityName: options.identity,
    locationTemplate: options.locationTemplate,
    repo: options.repo,
    leaseId: options.leaseId,
    dependencies: {
      acquireAnchor: async () => {
        const anchor = await acquireSessionAnchor(process.pid, ancestry);
        if (anchor.kind === "process") selectedAnchor = anchor;
        return anchor;
      },
      readState: async () => {
        if (selectedAnchor === null) throw new Error("Entering process anchor is unavailable");
        return readLocusState({
          identity: options.identity,
          pathFlavor,
          evidenceIO: createLocusEvidenceIO({
            exec: options.exec,
            identity: options.identity,
            inspector,
          }),
          subjectMetaIO: {
            readFile: (path) => readFile(path, "utf8"),
            pathExists: async (path) => access(path).then(() => true, () => false),
            realpath,
            lstat,
          },
          identityGlobalUserDir: options.identityGlobalUserDir,
          activeExtensions: options.activeExtensions,
          enteringAnchor: selectedAnchor,
          readPrimarySafety: (path) => readPrimarySafety({
            primaryPath: path,
            baseBranch: options.base,
            exec: options.exec,
          }),
        });
      },
      claim: async (record) => {
        const claimed = await transactTransientIdentities({
          exec: options.exec,
          execInput: options.execInput,
          identity: options.identity,
        }, {
          remote: "origin",
          message: `arc: open errand ${record.slug}`,
          transform: ordinaryErrandTransform({ kind: "create", record }),
        });
        if (claimed.kind === "applied" || claimed.kind === "idempotent") {
          if (claimed.value === null) return { kind: "error", message: "Identity claim returned no record" };
          return { kind: claimed.kind, record: claimed.value };
        }
        return claimed.kind === "refused"
          ? { kind: "refused", reason: claimed.reason }
          : { kind: "error", message: claimed.message };
      },
      rollbackClaim: async (record) => {
        const rolledBack = await rollbackIdentityClaim({
          exec: options.exec,
          execInput: options.execInput,
          identity: options.identity,
        }, {
          remote: "origin",
          message: `arc: roll back errand ${record.slug}`,
          expected: record,
        });
        return rolledBack.kind === "retired"
          ? { kind: "rolled-back" }
          : { kind: "generation-mismatch" };
      },
      provision: async (request) => {
        if (request.anchor.kind !== "process") {
          return { kind: "refused", reason: "lease-unknown", evidence: { kind: "identity-only" } };
        }
        return provisionTransientLocus({
          ...request,
          dependencies: createNodeProvisioningDependencies({
            exec: options.exec,
            identity: options.identity,
            anchor: request.anchor,
            inspector,
            pathFlavor,
            base: options.base,
            branch: request.branch,
            postCreateScript: options.postCreateScript,
            registeredHarnessDirs: options.registeredHarnessDirs,
          }),
        });
      },
    },
  });
}
