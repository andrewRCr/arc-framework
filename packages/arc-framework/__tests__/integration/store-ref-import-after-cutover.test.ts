import { expect, it, onTestFinished, vi } from "vitest";
import { createRefStore, RecordReferenceSchema, runStoreMigrate } from "../../src/lib/store/index.js";
import { IN_REPO_STORE_OVERRIDE, TRACKED_STATE_ROOTS } from "../../src/lib/store/selection.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it("refuses a repeat import after cutover and leaves later inbox edits local", async () => {
  vi.stubEnv(IN_REPO_STORE_OVERRIDE, undefined);
  onTestFinished(() => { vi.unstubAllEnvs(); });
  const h = await importFixture();
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  await h.git("git", ["rm", "-r", "--ignore-unmatch", "--", ...TRACKED_STATE_ROOTS]);
  await h.git("git", ["commit", "-m", "Remove tracked operational state"]);

  const tipArgs = ["rev-parse", "--verify", "refs/arc/project/inbox"];
  const importedTip = (await h.remote("git", tipArgs)).stdout.trim();
  // The pre-flip importer can still retry this landing.
  expect(await h.migrateCommand()).toMatchObject({ status: "ok" });

  const store = createRefStore(h.ports);
  const reference = RecordReferenceSchema.parse({
    kind: "project-inbox/inbox", owner: { type: "project", name: "project" },
  });
  const inbox = success(await store.read({ reference }));
  success(await store.write({
    action: "put", reference: inbox.reference, expected: inbox.version,
    content: inbox.content.replace("First source entry.", "Edited after cutover."),
    provenance: { verb: "edit", lifecycleAction: "edit" },
  }));
  const localTip = (await h.git("git", tipArgs)).stdout.trim();
  expect(localTip).not.toBe(importedTip);
  expect((await h.remote("git", tipArgs)).stdout.trim()).toBe(importedTip);

  const result = await runStoreMigrate(h.ports, { import: true });
  const remoteTip = (await h.remote("git", tipArgs)).stdout.trim();
  expect({ status: result.status, remoteTip }, `Unpublished inbox tip: ${localTip}`)
    .toEqual({ status: "refused", remoteTip: importedTip });
  expect(result).toMatchObject({
    refusal: { code: "store", refusal: {
      condition: expect.stringMatching(/already (?:holds|contains|been imported)/u),
      remedy: { argv: ["arc", "sync"] },
    } },
  });

  success(await store.push());
  expect((await h.remote("git", tipArgs)).stdout.trim()).toBe(localTip);
});
