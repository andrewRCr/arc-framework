/** Composition root for command-owned input schema registrations. */

import { initCommandInputPolicyDeclarations, initCommandInputRegistration } from "./commands/init-input.js";
import { joinCommandInputPolicyDeclarations, joinCommandInputRegistration } from "./commands/join-input.js";
import {
  configCommandInputPolicyDeclarations,
  configValidateCommandInputRegistration,
} from "./commands/config.js";
import { extensionsCommandInputPolicyDeclarations } from "./commands/extensions.js";
import { infrastructureCommandInputPolicyDeclarations } from "./command-input-infrastructure-policies.js";
import { activeCommandInputPolicyDeclarations } from "./handlers/active.js";
import { baseCommandInputPolicyDeclarations } from "./handlers/base.js";
import {
  checkCommitMessageInputPolicyDeclarations,
  checkCommitMessageInputRegistration,
} from "./handlers/check/commit-msg-cli.js";
import { errandCommandInputPolicyDeclarations, errandCommandInputRegistrations } from "./handlers/errand.js";
import { housekeepCommandInputPolicyDeclarations } from "./handlers/housekeep.js";
import { installationCommandInputPolicyDeclarations } from "./handlers/installation.js";
import {
  lifecycleCommandInputPolicyDeclarations,
  lifecycleCommandInputRegistrations,
} from "./handlers/lifecycle.js";
import { logStandaloneInputRegistration } from "./handlers/log.js";
import { planCheckInputRegistration, planCommandInputPolicyDeclarations } from "./handlers/plan.js";
import {
  deliveryCommandInputPolicyDeclarations,
  deliveryCommandInputRegistrations,
} from "./handlers/delivery.js";
import {
  deliveryTransferCommandInputPolicyDeclarations,
  deliveryTransferCommandInputRegistrations,
} from "./handlers/delivery-transfer.js";
import { locusCommandInputRegistrations } from "./handlers/locus.js";
import {
  wuReconcileCommandInputPolicyDeclarations,
  wuReconcileCommandInputRegistration,
} from "./handlers/reconcile.js";
import { recoverCommandInputPolicyDeclarations } from "./handlers/recover.js";
import { releaseCommitInputPolicyDeclarations } from "./handlers/release/commit-cli.js";
import { releasePushInputPolicyDeclarations } from "./handlers/release/push-cli.js";
import { releaseStatusCommandInputPolicyDeclarations } from "./handlers/release/record.js";
import {
  releaseSetupInstallInputPolicyDeclarations,
  releaseSetupInstallInputRegistration,
} from "./handlers/release/setup/install.js";
import {
  releaseSetupPrintPatternsInputPolicyDeclarations,
  releaseSetupPrintPatternsInputRegistration,
} from "./handlers/release/setup/print-patterns.js";
import {
  releaseSetupUninstallInputPolicyDeclarations,
  releaseSetupUninstallInputRegistration,
} from "./handlers/release/setup/uninstall.js";
import { releaseSetupVerifyInputRegistration } from "./handlers/release/setup/verify.js";
import {
  reviewCommandInputPolicyDeclarations,
  reviewCommandInputRegistrations,
} from "./handlers/review.js";
import { startCommandInputPolicyDeclarations, startCommandInputRegistration } from "./handlers/start.js";
import { statusCommandInputPolicyDeclarations, statusCommandInputRegistration } from "./handlers/status.js";
import { syncCommandInputPolicyDeclarations } from "./handlers/sync.js";
import { userCommandInputPolicyDeclarations, userCommandInputRegistrations } from "./handlers/user.js";
import { userSyncCommandInputPolicyDeclarations } from "./handlers/user-sync.js";
import type { CommandInputDeclaration } from "./lib/command-input/declaration.js";
import { viewCommandInputPolicyDeclarations, viewCommandInputRegistration } from "./handlers/view.js";
import { remedyRoadmapConflictInputPolicyDeclarations } from "./scripts/remedy-roadmap-conflict.js";
import type { CommandInputRegistration } from "./lib/command-input/registry.js";

/** Every command-owned schema registration contributed by migrated families. */
export const commandInputRegistrations = [
  initCommandInputRegistration,
  joinCommandInputRegistration,
  checkCommitMessageInputRegistration,
  configValidateCommandInputRegistration,
  startCommandInputRegistration,
  ...lifecycleCommandInputRegistrations,
  ...errandCommandInputRegistrations,
  ...locusCommandInputRegistrations,
  planCheckInputRegistration,
  ...deliveryCommandInputRegistrations,
  ...deliveryTransferCommandInputRegistrations,
  wuReconcileCommandInputRegistration,
  statusCommandInputRegistration,
  logStandaloneInputRegistration,
  ...userCommandInputRegistrations,
  viewCommandInputRegistration,
  releaseSetupInstallInputRegistration,
  releaseSetupPrintPatternsInputRegistration,
  releaseSetupUninstallInputRegistration,
  releaseSetupVerifyInputRegistration,
  ...reviewCommandInputRegistrations,
] as const satisfies readonly CommandInputRegistration[];

/** Command-owned policy declarations composed without reinterpreting their domain semantics. */
export const commandInputPolicyDeclarations = [
  ...activeCommandInputPolicyDeclarations,
  ...baseCommandInputPolicyDeclarations,
  ...checkCommitMessageInputPolicyDeclarations,
  ...configCommandInputPolicyDeclarations,
  ...errandCommandInputPolicyDeclarations,
  ...extensionsCommandInputPolicyDeclarations,
  ...housekeepCommandInputPolicyDeclarations,
  ...initCommandInputPolicyDeclarations,
  ...installationCommandInputPolicyDeclarations,
  ...joinCommandInputPolicyDeclarations,
  ...lifecycleCommandInputPolicyDeclarations,
  ...planCommandInputPolicyDeclarations,
  ...deliveryCommandInputPolicyDeclarations,
  ...deliveryTransferCommandInputPolicyDeclarations,
  ...wuReconcileCommandInputPolicyDeclarations,
  ...recoverCommandInputPolicyDeclarations,
  ...releaseCommitInputPolicyDeclarations,
  ...releasePushInputPolicyDeclarations,
  ...releaseSetupInstallInputPolicyDeclarations,
  ...releaseSetupPrintPatternsInputPolicyDeclarations,
  ...releaseSetupUninstallInputPolicyDeclarations,
  ...releaseStatusCommandInputPolicyDeclarations,
  ...reviewCommandInputPolicyDeclarations,
  ...startCommandInputPolicyDeclarations,
  ...statusCommandInputPolicyDeclarations,
  ...syncCommandInputPolicyDeclarations,
  ...userCommandInputPolicyDeclarations,
  ...userSyncCommandInputPolicyDeclarations,
  ...viewCommandInputPolicyDeclarations,
  ...remedyRoadmapConflictInputPolicyDeclarations,
  ...infrastructureCommandInputPolicyDeclarations,
] as const satisfies readonly CommandInputDeclaration[];
