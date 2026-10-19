/** Render the selected operational store as the identity's on-demand user view. */
import type { ResolvedSettingsResult } from "../../lib/config/resolved-settings.js";
import { deriveStoreInFlight, type DeriveStoreInFlightOptions, type StoreInFlightResult } from "../../lib/git/in-flight-store.js";
import type { Store } from "../../lib/store/contract.js";
import { readStoreUserInFlight } from "../../lib/status/store-user-in-flight.js";
import { readStoreUserReady } from "../../lib/status/store-user-ready.js";
import { composeUserView, USER_VIEW_IDENTITY_MESSAGE } from "../../lib/status/user-view.js";
import type { StatusCliOptions } from "./input.js";
import type { SessionStatusContext } from "./session-context.js";
import { pullStoreStatus } from "./store-locus.js";
import { readStatusCheckoutRoster } from "./checkout-roster.js";
import { positive } from "./store-session.js";
import { renderStatusViewRefusal } from "./refusal.js";

/** Invocation-bound membership provider; defaults to the production local derivation. */
export interface StoreUserStatusPorts { readInFlight?: typeof deriveStoreInFlight }

/** Acquire both slices without consulting or writing a rendered cache. */
export async function handleStoreUserStatus(context: SessionStatusContext & { store: Store }, opts: StatusCliOptions,
  resolved: ResolvedSettingsResult, ports: StoreUserStatusPorts): Promise<void> {
  if (context.identity === null) {
    const view = { output: USER_VIEW_IDENTITY_MESSAGE, source: "no-identity", warnings: [] };
    process.stdout.write(`${opts.json ? JSON.stringify(view) : view.output}\n`);
    return;
  }
  const pullWarnings = opts.fetch === true && !opts.local ? await pullStoreStatus({ sync: context.storeSync }) : [];
  const ready = await readStoreUserReady({ store: context.store, identity: context.identity,
    reviewAfterDays: positive(resolved.settings["pause.review_after_days"], 14) });
  if (ready.status === "refused") { renderStatusViewRefusal(ready.refusal, opts); return; }
  const identity = context.identity;
  const inFlight = await readStoreUserInFlight({ store: context.store, exec: context.exec, cwd: context.cwd,
    identity: context.identity, teamMode: resolved.settings["team.mode"] === "true", readInFlight: ports.readInFlight ?? (input => readUserMembership(context, identity, input)) });
  const view = { output: composeUserView(context.identity, inFlight.rows, ready.result.rows), source: "rendered",
    warnings: [...pullWarnings.map(warning => warning.rendered), ...inFlight.warnings, ...ready.result.warnings.map(warning => warning.rendered)] };
  if (!opts.json) for (const warning of view.warnings) process.stderr.write(`warning: ${warning}\n`);
  process.stdout.write(`${opts.json ? JSON.stringify(view) : view.output}\n`);
}

async function readUserMembership(context: SessionStatusContext, identity: string, input: DeriveStoreInFlightOptions): Promise<StoreInFlightResult> {
  let roster: DeriveStoreInFlightOptions["roster"];
  let failure: string | undefined;
  try { roster = await readStatusCheckoutRoster(context, identity); }
  catch (error) { failure = error instanceof Error ? error.message : String(error); }
  const result = await deriveStoreInFlight({ ...input, roster });
  if (failure === undefined) return result;
  return { ...result, marks: [...new Set([...(result.marks ?? []), "degraded" as const])],
    warnings: [...result.warnings, { code: "worktree-list-failed",
      rendered: `Checkout roster unavailable: ${failure} Inspect arc locus --json, repair the checkout evidence, then retry.` }] };
}
