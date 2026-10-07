/** Install native-launch admission for the current unit test file. */
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { beforeEach, afterEach, afterAll, expect } from "vitest";
import { stop } from "esbuild";
import { UnitProcessGuard, type UnitLaunchSnapshot } from "./unit-process-guard-core.js";

import {
  UNIT_PROCESS_LAUNCH_COUNT_META, UNIT_PROCESS_ALLOWLISTED_META,
} from "../../src/lib/unit-process-metadata.js";

const INSTALLATION = Symbol.for("arc.unit-process-guard.installation");
const LAUNCH_FUNCTIONS = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const;
type NativeOperation = (...args: unknown[]) => unknown;
interface Installation {
  guard: UnitProcessGuard;
  allowlist: readonly string[];
}

/**
 * Install the unit file's native process admission.
 * @param allowlist - Package-relative files permitted to invoke native launch functions.
 * @returns After installing the file's guard.
 */
export async function installUnitProcessGuard(allowlist: readonly string[]): Promise<void> {
  await stop();
  const previous = Reflect.get(childProcess, INSTALLATION) as Installation | undefined;
  const guard = new UnitProcessGuard(resolve(import.meta.dirname, "../.."), allowlist,
    () => expect.getState().testPath);
  const installation = previous ?? { guard, allowlist };
  installation.guard = guard;
  installation.allowlist = [...allowlist];
  if (previous === undefined) {
    Reflect.set(childProcess, INSTALLATION, installation);
    for (const name of LAUNCH_FUNCTIONS) {
      const original = Reflect.get(childProcess, name) as NativeOperation;
      const wrapped = function (this: unknown, ...args: unknown[]): unknown {
        return installation.guard.launch(name, () => Reflect.apply(original, this, args));
      };
      const custom = Reflect.get(original, promisify.custom) as NativeOperation | undefined;
      if (typeof custom === "function") {
        Reflect.set(wrapped, promisify.custom, function (this: unknown, ...args: unknown[]): unknown {
          return installation.guard.launch(name, () => Reflect.apply(custom, this, args));
        });
      }
      Reflect.set(childProcess, name, wrapped);
    }
  }
  syncBuiltinESMExports();
  const before = new WeakMap<object, UnitLaunchSnapshot>();
  beforeEach(({ task }) => { before.set(task, guard.snapshot()); });
  afterEach(({ task }) => {
    const snapshot = guard.snapshot();
    const metadata = task.meta as Record<string, unknown>;
    metadata[UNIT_PROCESS_LAUNCH_COUNT_META] = snapshot.launchCount;
    metadata[UNIT_PROCESS_ALLOWLISTED_META] = snapshot.allowlisted;
    const starting = before.get(task);
    if (starting !== undefined) guard.assertNoBlockedSince(starting);
  });
  // Vitest requires destructuring the fixture context even when only the suite argument is used.
  // eslint-disable-next-line no-empty-pattern
  afterAll(async ({}, suite) => {
    const snapshot = guard.snapshot();
    const metadata = suite.meta as Record<string, unknown>;
    metadata[UNIT_PROCESS_LAUNCH_COUNT_META] = snapshot.launchCount;
    metadata[UNIT_PROCESS_ALLOWLISTED_META] = snapshot.allowlisted;
    try { guard.assertNoBlockedAtFileEnd(); } finally { await stop(); }
  });
}

/**
 * Read the installed unit admission configuration.
 * @returns Current immutable allowlist snapshot, or absence before installation.
 */
export function readUnitProcessGuardInstallation(): { readonly allowlist: readonly string[] } | undefined {
  const installation = Reflect.get(childProcess, INSTALLATION) as Installation | undefined;
  return installation === undefined ? undefined : { allowlist: [...installation.allowlist] };
}
