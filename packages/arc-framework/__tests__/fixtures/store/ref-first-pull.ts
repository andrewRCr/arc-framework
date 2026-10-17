/** First-pull process reporting its actual terminal state and public store result. */

import { createRefStore, createDefaultStorePorts, createRefLockFactory } from "../../../src/lib/store/index.js";
import { readConfigSettings } from "../../../src/lib/config/status-reader.js";
import { createExecaRawGitExec } from "../../../src/lib/git/process-executor.js";
import { createRefClock } from "../../helpers/store/ref-clock.js";

const root = process.argv[2];
if (!root) throw new Error("A first pull requires a checkout");
const defaults = createDefaultStorePorts({ checkoutRoot: root });
const store = createRefStore({ ...defaults, ...createRefClock(new Date(0), 0),
  backingRepository: async () => (await readConfigSettings(root)).settings["storage.backing_repository"] || null,
  rawExec: createExecaRawGitExec(root), lock: createRefLockFactory(defaults), random: () => 0.5,
  actor: async (identity) => `${identity}@00000000-0000-4000-8000-000000000001`,
});
process.stdout.write(`${JSON.stringify({ tty: Boolean(process.stdin.isTTY), result: await store.pull() })}\n`);
