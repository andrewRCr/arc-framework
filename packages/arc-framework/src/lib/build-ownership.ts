/** Checkout-specific exclusion for runtime consumers and artifact publishers. */
import type { RenewableLease } from "./renewable-lease.js";
import { ADVISORY_LEASE_DURATION_MS, withRenewableLease } from "./renewable-lease.js";
import { acquireAdvisoryLock, type AdvisoryLockOptions, type AdvisoryLockHandle } from "./advisory-lock.js";
import { NATIVE_LEASE_PROCESS, type LeaseProcessDependencies } from "./lease-process.js";
import { join, resolve } from "node:path";
import {
  withLocalHeavyTestAdmission, type LocalTestAdmissionInput, type LocalTestAdmissionResult,
} from "./local-test-admission.js";

/** Lease path stays beside live output, outside every compiler clean target. */
export const BUILD_ARTIFACT_LOCK_NAME = ".arc-build.lock";

/** Native acquisition and process boundaries for artifact ownership. */
export interface BuildOwnershipDependencies extends LeaseProcessDependencies {
  readonly acquireLock: (path: string, options?: AdvisoryLockOptions) => Promise<AdvisoryLockHandle>;
}

/** Checkout and operator label for one owning action. */
export interface BuildOwnershipInput {
  readonly packageRoot: string;
  readonly operation: string;
}

/** Artifact capability valid only inside the owning action. */
export interface BuildArtifactLease extends RenewableLease {
  readonly packageRoot: string;
}

/**
 * Hold checkout artifacts across a build or prepared test controller.
 * @param input - Checkout boundary and diagnostic operation
 * @param action - Work performed with the acquired artifact capability
 * @param overrides - Native lock, process, and clock boundaries
 * @returns The action result after release
 */
export async function withBuildArtifactOwnership<T>(
  input: BuildOwnershipInput, action: (lease: BuildArtifactLease) => Promise<T>,
  overrides: Partial<BuildOwnershipDependencies> = {},
): Promise<T> {
  const deps = { ...NATIVE_LEASE_PROCESS, acquireLock: acquireAdvisoryLock, ...overrides };
  const packageRoot = resolve(input.packageRoot);
  const startedAt = deps.now();
  let lastReport: number | undefined;
  const handle = await deps.acquireLock(join(packageRoot, BUILD_ARTIFACT_LOCK_NAME), {
    pid: deps.pid, processInstance: deps.processInstance, processScope: await deps.resolveProcessScope(),
    leaseDurationMs: ADVISORY_LEASE_DURATION_MS, maxWaitMs: Number.POSITIVE_INFINITY, now: deps.now,
    metadata: { operation: input.operation, packageRoot, startedAt: new Date(startedAt).toISOString() },
    onWait: ({ holder, waitedMs }) => {
      if (lastReport !== undefined && waitedMs - lastReport < 60_000) return;
      lastReport = waitedMs;
      if (holder === "unreadable") {
        deps.writeLine("Waiting for checkout artifacts whose holder cannot be read; interrupt this command to cancel.");
        return;
      }
      const metadata = holder.metadata;
      const operation = typeof metadata === "object" && metadata !== null && "operation" in metadata
        && typeof metadata.operation === "string" ? metadata.operation : "another build or test controller";
      deps.writeLine(`Waiting for checkout artifacts held by ${operation} (PID ${String(holder.pid)}); `
        + "interrupt this command to cancel the wait.");
    },
  });
  return await withRenewableLease(handle, startedAt,
    async (lease) => await action({ ...lease, packageRoot }), deps,
    { lock: "Checkout artifact lock", controller: "the owning build or test controller" });
}

/** Native boundaries for the two independently scoped owning capabilities. */
export interface TestOwnershipOverrides {
  readonly artifacts?: Partial<BuildOwnershipDependencies>;
  readonly admission?: NonNullable<Parameters<typeof withLocalHeavyTestAdmission>[2]>;
}

/**
 * Admit a heavy controller before acquiring its checkout artifacts.
 * @param input - Controller checkout, environment, and diagnostic tier
 * @param action - Execution and closing under artifact ownership
 * @param overrides - Native admission and artifact boundaries
 * @returns Controller outcome with CPU queue latency when observed
 */
export async function withTestArtifactOwnership<T>(
  input: LocalTestAdmissionInput & { readonly packageRoot: string },
  action: (lease: BuildArtifactLease) => Promise<T>, overrides: TestOwnershipOverrides = {},
): Promise<LocalTestAdmissionResult<T>> {
  return await withLocalHeavyTestAdmission(input,
    async () => await withBuildArtifactOwnership({ packageRoot: input.packageRoot, operation: `tests (${input.tier})` },
      action, overrides.artifacts), overrides.admission);
}
