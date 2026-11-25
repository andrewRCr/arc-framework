/** Errand commands from a build that predates the storage cutover refuse, naming why, once the store is imported. */
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-store-ports.js";
import { createStore } from "../../src/lib/store/create.js";
import { StoreImportedError } from "../../src/lib/store/store-imported.js";

const REGISTRY = "refs/arc/project/registry";
const TIMEOUT_MS = 60_000;

it("refuses every Errand lifecycle command from a build keeping state in the checkout, and none past the cutover", async () => {
  const f = await repairCliFixture();
  const inRepo = createStore(createDefaultStorePorts({ checkoutRoot: f.cwd }));
  expect(inRepo.capabilities.stateOffBranch).toBe(false);
  const message = new StoreImportedError().message;
  await f.exec("git", ["update-ref", REGISTRY, "HEAD"]);
  for (const argv of [
    ["errand", "open", "sealed", "--intent", "Probe the seal", "--json"],
    ["errand", "materialize", "sealed", "--json"],
    ["errand", "link", "sealed", "--from-inbox", "Probe the seal", "--json"],
    ["errand", "leave", "sealed", "--state", "paused", "--json"],
    ["errand", "close", "sealed", "--json"],
    ["errand", "abandon", "sealed", "--json"],
    ["errand", "promote", "sealed", "--floor", "scale", "--json"],
  ]) {
    const run = await repairCli(f, argv, { store: inRepo });
    expect(run.result, `${argv.join(" ")}: ${run.stdout}${run.stderr}`)
      .toMatchObject({ outcome: "refused", reason: "store-imported", recommendedPromptText: message });
    expect(run.exitCode).toBe(1);
  }
  expect((await f.exec("git", ["branch", "--list", "chore/sealed"])).stdout).toBe("");

  const pastCutover = await repairCli(f, ["errand", "open", "sealed", "--intent", "Probe the seal", "--json"]);
  expect(pastCutover.result, pastCutover.stdout + pastCutover.stderr).toMatchObject({ outcome: "applied" });
}, TIMEOUT_MS);
