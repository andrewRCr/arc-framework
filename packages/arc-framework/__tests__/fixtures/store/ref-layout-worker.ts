/** A real move process that can be killed while its persistent switch is paused. */

import { z } from "zod";
import { createDefaultStorePorts, createRefLockFactory, runStoreRemote } from "../../../src/lib/store/index.js";
import { createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import { createRefClock } from "../../helpers/store/ref-clock.js";

const root = process.argv[2];
if (!root) throw new Error("A layout worker requires a checkout");
const job = z.strictObject({ role: z.enum(["push", "off"]), stopBefore: z.string().min(1) }).parse(JSON.parse(process.argv[3] ?? "null"));
const defaults = createDefaultStorePorts({ checkoutRoot: root });
const result = await runStoreRemote({ ...defaults, ...createRefClock(), backingRepository: async () => null,
  rawExec: createExecaRawGitExec(root), lock: createRefLockFactory(defaults), random: () => 0.5,
  actor: async (identity) => `${identity}@00000000-0000-4000-8000-000000000001`,
  migrateStep: async (step) => {
    if (step !== job.stopBefore) return;
    process.stdout.write("READY\n");
    await new Promise<void>((resolve) => process.stdin.once("data", () => { process.stdin.pause(); resolve(); }));
  },
}, { remote: "origin", role: job.role });
process.stdout.write(`${JSON.stringify(result)}\n`);
