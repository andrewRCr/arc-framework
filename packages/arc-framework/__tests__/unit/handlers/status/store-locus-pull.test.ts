/** Every status mode shares pull orientation and coded diagnostics. */
import { expect, it } from "vitest";
import { pullStoreStatus } from "../../../../src/handlers/status/store-locus.js";
import { createStoreSyncPort } from "../../../../src/lib/store/operational-sync.js";
import type { PullResult } from "../../../../src/lib/store/operational-sync.js";

it.each(["pulled", "noop", "no-remote"] as const)("renders %s without a warning", async status => {
  expect(await pullStoreStatus({ sync: createStoreSyncPort({ pull: async () => ({ status }) }) })).toEqual([]);
});

it.each([
  { pull: { status: "no-identity" }, rendered: "No store identity is configured. Run git config arc.identity <name> and retry." },
  { pull: { status: "unreachable", condition: "State remote offline.", remedy: { text: "Reconnect and retry." } },
    rendered: "State remote offline. Reconnect and retry." },
  { pull: { status: "designation-needed", remote: "backup", choices: ["state", "code-and-state"],
    remedy: { text: "Choose the state role.", argv: ["arc", "store", "remote", "backup", "state"] } },
    rendered: "Remote backup needs a store designation. Choose the state role. arc store remote backup state" },
] satisfies { pull: PullResult; rendered: string }[])("codes $pull.status with its shared orientation and repair route", async ({ pull, rendered }) => {
  expect(await pullStoreStatus({ sync: createStoreSyncPort({ pull: async () => pull }) }))
    .toEqual([{ code: "pull-incomplete", rendered }]);
});
