/** Selected native execution and controller closing inside CPU/artifact ownership. */
import { closeVitestController } from "./vitest-closing.js";
import { checkVitestCompletion } from "./vitest-completion.js";
import { ensureOwnedRuntimeArtifacts } from "./build-entry.js";
import { withTestArtifactOwnership } from "./build-ownership.js";
import { PREPARED_RUNTIME_BUILD_KEY, requirePreparedRuntimeBuild, validateRuntimeBuildEvidence } from "./build-runtime-setup.js";
import { type LocalTestAdmissionInput } from "./local-test-admission.js";
import type { VitestSelection } from "./vitest-discovery.js";

/**
 * Prepare selected runtime projects and retain ownership until their controller closes.
 * @param selection - One initialized native controller and refined specifications
 * @param input - Native package boundary, admission context, and operator label
 * @returns Completion after controller closing and owned lease release
 */
export async function executeVitestSelection(
  selection: VitestSelection, input: LocalTestAdmissionInput & { readonly packageRoot: string },
): Promise<void> {
  const lifetime = { closed: false };
  const close = async (): Promise<void> => { lifetime.closed = true; await closeVitestController(selection.controller); };
  try {
    if (selection.requiresRuntime) {
      await withTestArtifactOwnership(input, async (lease) => {
        try {
          const evidence = validateRuntimeBuildEvidence(input.packageRoot, await ensureOwnedRuntimeArtifacts(lease));
          selection.controller.provide(PREPARED_RUNTIME_BUILD_KEY, evidence);
          requirePreparedRuntimeBuild(input.packageRoot, selection.controller.getProvidedContext());
          await lease.confirmOwnership();
          checkVitestCompletion(await selection.controller.runTestSpecifications(selection.specifications, true),
            selection.controller.logger);
        } finally { await close(); }
      });
    } else {
      try { checkVitestCompletion(await selection.controller.runTestSpecifications(selection.specifications, true),
            selection.controller.logger); }
      finally { await close(); }
    }
  } finally { if (!lifetime.closed) await close(); }
}
