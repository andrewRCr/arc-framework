/** Read-only validation of captured explicit file bindings before runner readiness. */
import type { CapturedEnvironmentInputs } from "../environment-inputs.js";
import { nodeSourcePresentationIO } from "./source-io.js";
import { CapturedEnvironmentSchema } from "./contract-execution.js";
import { FrozenFileVerificationError, verifyFrozenFile, type FrozenFileVerificationIO } from "./frozen-file.js";

/** Verify frozen file copies without reopening original caller paths. */
export async function verifyCapturedEnvironment(bindings: CapturedEnvironmentInputs["bindings"],
  io: FrozenFileVerificationIO = nodeSourcePresentationIO): Promise<void> {
  const parsed = CapturedEnvironmentSchema.safeParse(bindings);
  if (!parsed.success) throw new Error("Captured environment inputs are invalid; repair the input declarations, recapture and retry.");
  for (const [name, binding] of Object.entries(parsed.data)) {
    if (binding.kind !== "file" || binding.state !== "file") continue;
    try { await verifyFrozenFile(io, binding.path, binding); }
    catch (cause) {
      const reason = cause instanceof FrozenFileVerificationError ? cause.message : "file could not be verified";
      throw new Error(`Could not verify environment_inputs binding ${name}: ${reason}; repair the file input, recapture and retry the check request.`, { cause });
    }
  }
}
