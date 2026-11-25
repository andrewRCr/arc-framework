/** Named invocation signals for tests using the production interaction resolver. */
import {
  resolveInteractionContext, type InteractionContext, type InteractionSignals,
} from "../../src/lib/command-input/interaction-context.js";

/**
 * Build a context using the production resolver.
 * @param signals - Named invocation and terminal facts; defaults to an interactive terminal.
 * @returns The resolved immutable interaction context.
 */
export function makeInteractionContext(signals: Partial<InteractionSignals> = {}): InteractionContext {
  return resolveInteractionContext({
    noInput: false, machineReadable: false, ci: false,
    promptInputIsTTY: true, promptOutputIsTTY: true, yes: "absent", ...signals,
  });
}
