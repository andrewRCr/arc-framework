/**
 * Constitution subcommand public surface.
 *
 * Keeps a stable `commands/constitution.ts` import path for the composite
 * handler and tests. No standalone `arc constitution` command exists yet —
 * the probe is currently consumed only via the session-init composite.
 */

export { runDomainRulesSessionInitStatus } from "./constitution/status.js";
export { buildDomainRulesSessionInitSummary } from "./constitution/format.js";
export type {
  DomainRulesEntry,
  DomainRulesSessionInitOptions,
  DomainRulesSessionInitResult,
} from "./constitution/types.js";
