/** Selected native execution and controller closing inside CPU/artifact ownership. */
import { closeVitestController } from "./vitest-closing.js";
import { checkVitestCompletion } from "./vitest-completion.js";
import { ensureOwnedRuntimeArtifacts } from "./build-entry.js";
import { withTestArtifactOwnership, type BuildArtifactLease, type TestOwnershipOverrides } from "./build-ownership.js";
import { PREPARED_RUNTIME_BUILD_KEY, requirePreparedRuntimeBuild, validateRuntimeBuildEvidence } from "./build-runtime-setup.js";
import { type LocalTestAdmissionInput, type LocalTestAdmissionResult } from "./local-test-admission.js";
import type { VitestSelection } from "./vitest-discovery.js";

/**
 * Prepare selected runtime projects and retain ownership until their controller closes.
 * @param selection - One initialized native controller and refined specifications
 * @param input - Native package boundary, admission context, and operator label
 * @param afterClose - Optional capture after closing and before ownership release
 * @param ownership - Native admission and artifact boundaries
 * @returns Completion after controller closing and owned lease release
 */
export function executeVitestSelection(
  selection: VitestSelection, input: LocalTestAdmissionInput & { readonly packageRoot: string },
): Promise<LocalTestAdmissionResult<undefined>>;
export function executeVitestSelection<T>(
  selection: VitestSelection, input: LocalTestAdmissionInput & { readonly packageRoot: string },
  afterClose: () => T | Promise<T>, ownership?: TestOwnershipOverrides,
): Promise<LocalTestAdmissionResult<T>>;
export async function executeVitestSelection<T>(
  selection: VitestSelection, input: LocalTestAdmissionInput & { readonly packageRoot: string },
  afterClose?: () => T | Promise<T>, ownership: TestOwnershipOverrides = {},
): Promise<LocalTestAdmissionResult<T | undefined>> {
  const lifetime = { closed: false };
  const close = async (): Promise<void> => { lifetime.closed = true; await closeVitestController(selection.controller); };
  const execute = async (lease?: BuildArtifactLease): Promise<T | undefined> => {
    try {
      if (lease !== undefined) {
        const evidence = validateRuntimeBuildEvidence(input.packageRoot, await ensureOwnedRuntimeArtifacts(lease));
        selection.controller.provide(PREPARED_RUNTIME_BUILD_KEY, evidence);
        requirePreparedRuntimeBuild(input.packageRoot, selection.controller.getProvidedContext());
        await lease.confirmOwnership();
      }
      checkVitestCompletion(await selection.controller.runTestSpecifications(selection.specifications, true),
        selection.controller.logger);
    } finally { await close(); }
    return await afterClose?.();
  };
  try {
    if (selection.requiresRuntime) return await withTestArtifactOwnership(input, execute, ownership);
    return { result: await execute() };
  } finally { if (!lifetime.closed) await close(); }
}
