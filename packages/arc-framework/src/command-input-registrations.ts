/** Composition root for command-owned input schema registrations. */

import { initCommandInputRegistration } from "./commands/init-input.js";
import { joinCommandInputRegistration } from "./commands/join-input.js";
import { checkCommitMessageInputRegistration } from "./handlers/check/commit-msg-cli.js";
import { errandCommandInputRegistrations } from "./handlers/errand.js";
import { lifecycleCommandInputRegistrations } from "./handlers/lifecycle.js";
import { logStandaloneInputRegistration } from "./handlers/log.js";
import { planCheckInputRegistration } from "./handlers/plan.js";
import { releaseSetupInstallInputRegistration } from "./handlers/release/setup/install.js";
import { releaseSetupPrintPatternsInputRegistration } from "./handlers/release/setup/print-patterns.js";
import { releaseSetupUninstallInputRegistration } from "./handlers/release/setup/uninstall.js";
import { releaseSetupVerifyInputRegistration } from "./handlers/release/setup/verify.js";
import { startCommandInputRegistration } from "./handlers/start.js";
import { statusCommandInputRegistration } from "./handlers/status.js";
import { userCommandInputRegistrations } from "./handlers/user.js";
import { viewCommandInputRegistration } from "./handlers/view.js";
import type { CommandInputRegistration } from "./lib/command-input/registry.js";

/** Every command-owned schema registration contributed by migrated families. */
export const commandInputRegistrations = [
  initCommandInputRegistration,
  joinCommandInputRegistration,
  checkCommitMessageInputRegistration,
  startCommandInputRegistration,
  ...lifecycleCommandInputRegistrations,
  ...errandCommandInputRegistrations,
  planCheckInputRegistration,
  statusCommandInputRegistration,
  logStandaloneInputRegistration,
  ...userCommandInputRegistrations,
  viewCommandInputRegistration,
  releaseSetupInstallInputRegistration,
  releaseSetupPrintPatternsInputRegistration,
  releaseSetupUninstallInputRegistration,
  releaseSetupVerifyInputRegistration,
] as const satisfies readonly CommandInputRegistration[];
