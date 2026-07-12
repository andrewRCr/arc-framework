/** Closed repository-only assembly of self-hosting review-gate executable operations. */

import { provisionRepairEnvironment } from "../hosts/github/repair-environment.js";
import { createReadOnlyNextActionReader } from "./action-composition.js";
import { runNextAction, runPerformAction } from "./action-main.js";
import { runAttestMain } from "./attest-main.js";
import { runAwaitMain } from "./await-main.js";
import { createAttestRuntime, createReconcileRuntime } from "./composition.js";
import { runDiscoveryMain } from "./discovery-main.js";
import { recordProviderClosure, settleFixedFinding, settleNonFixFinding } from "./finding-settlement.js";
import { createReadOnlyHeadMutabilityReader } from "./head-mutability-composition.js";
import { runAssertHeadMutable } from "./head-mutability-main.js";
import { runReconcileMain } from "./reconcile-main.js";
import { parseRepairDispatchEvent, validateRepairDispatch } from "./repair-main.js";
import { ensureDirectReply, ensureThreadResolution } from "./settlement-runtime.js";

/** Every private executable operation; none is exported by the public CLI bundle. */
export const SELF_HOSTING_REVIEW_GATE = Object.freeze({
  createReconcileRuntime,
  createAttestRuntime,
  createReadOnlyNextActionReader,
  createReadOnlyHeadMutabilityReader,
  runDiscoveryMain,
  runReconcileMain,
  runAttestMain,
  runNextAction,
  runPerformAction,
  runAwaitMain,
  runAssertHeadMutable,
  settleFixedFinding,
  settleNonFixFinding,
  recordProviderClosure,
  ensureDirectReply,
  ensureThreadResolution,
  parseRepairDispatchEvent,
  validateRepairDispatch,
  provisionRepairEnvironment,
});
