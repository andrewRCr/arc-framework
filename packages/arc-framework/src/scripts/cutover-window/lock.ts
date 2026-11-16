/** Select and lock the marked linked checkouts that must survive the cutover window. */
import { readWindowCheckouts, type WindowCheckout } from "./checkouts.js";
import type { WindowFinding, WindowResult } from "./result.js";
import type { WindowRequest } from "./main.js";
import type { GitExec } from "../../lib/git/exec.js";
import { lockSpawnedCheckout } from "../../lib/git/worktree-removal.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { parseArgs } from "node:util";

/** Replaceable Git boundary for observing native lock failures. */
export interface WindowLockOptions { exec?: GitExec }

/** Lock every selected checkout, reporting individual failures while continuing through the inventory. */
export async function lockWindow(request: WindowRequest, options: WindowLockOptions = {}): Promise<WindowResult> {
  parseArgs({ args: [...request.args], options: { repo: { type: "string" }, json: { type: "boolean" } } });
  const ports = createDefaultStorePorts({ checkoutRoot: request.repo });
  const boundary = options.exec ?? ports.exec;
  const exec: GitExec = (command, args, execution) => boundary(command, args, { ...execution, cwd: request.repo });
  const checkouts = await readWindowCheckouts({ repo: request.repo, exec });
  const locked: string[] = [], messages: string[] = [], findings: WindowFinding[] = [];
  for (const checkout of unlockedMarkedCheckouts(checkouts)) {
    const outcome = await lockSpawnedCheckout(exec, checkout.path);
    if (outcome.kind === "locked") {
      locked.push(checkout.path); messages.push(`Locked ${checkout.path}`);
    } else if (outcome.kind === "failed") {
      findings.push({ subject: checkout.path, condition: `Could not lock the checkout: ${outcome.detail}`,
        remedy: "Repair the lock failure and run lock again; check refuses this checkout while it remains unlocked." });
    }
  }
  return { operation: "lock", status: "reported", messages, findings, data: { locked } };
}

/** Name every marked linked registration that still needs a Git worktree lock. */
export function windowCheckoutLockFindings(checkouts: readonly WindowCheckout[]): WindowFinding[] {
  return unlockedMarkedCheckouts(checkouts).map(checkout => ({ subject: checkout.path,
    condition: "The marked linked checkout is unlocked.",
    remedy: "Run lock for the importing repository, then retry check." }));
}

function unlockedMarkedCheckouts(checkouts: readonly WindowCheckout[]): WindowCheckout[] {
  return checkouts.filter(checkout => !checkout.primary && checkout.kind === "marked" && checkout.locked === undefined);
}
