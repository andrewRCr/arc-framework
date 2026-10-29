/** Remote-move reports disclose publication and late-push behavior before and after execution. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createKindRegistry, createRefStore, RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { switchFixture, personal, provenance, capturePeerState, landPreparedOldPush } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("discloses a prepared push landing after the final listing in both trial and completed reports", async () => {
  const h = await switchFixture();
  success(await h.b.store.pull());
  const before = await capturePeerState(h);
  const beth = createRefStore({ ...h.b.ports, identity: async () => SlugSchema.parse("beth") });
  const late = RecordReferenceSchema.parse({ ...personal, owner: { type: "person", name: "beth" }, key: "late.md" });
  success(await beth.write({ action: "put", reference: late, expected: null, content: "Prepared before the switch.\n", provenance }));
  const after = await capturePeerState(h);
  const trial = await invokeStoreMigrate(["--to", h.to, "--trial"], h.ports);
  expect(trial.status, JSON.stringify(trial)).toBe("ok");
  if (trial.status !== "ok") throw new Error("Trial refused");
  const trialNotice = trial.result.notices.map(row => row.condition).join("\n");
  expect(trialNotice).toMatch(/Teammates follow.*pointer.*code/u);
  expect(trialNotice).toMatch(/Later publication stops.*already published state is not unpublished/u);
  expect(trialNotice).toMatch(/push composed before.*after.*last listing/u);
  const moved = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.finish") await landPreparedOldPush(h, before, after);
  } });
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  if (moved.status !== "ok") throw new Error("Move refused");
  expect(moved.result.notices).toEqual(trial.result.notices);
  expect((await h.remote("git", ["grep", "-F", "Prepared before the switch.", "refs/arc/user/beth/personal"])).stdout).toContain("Prepared before the switch.");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/user/beth/personal"])).stdout).toBe("");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);

it("retains a landed merge's advisory condition and remedy when resuming its switch", async () => {
  const h = await switchFixture();
  success(await h.b.store.pull());
  const destination = RecordReferenceSchema.parse({ ...personal, key: "destination.md" });
  const source = RecordReferenceSchema.parse({ ...personal, key: "source.md" });
  success(await h.b.store.write({ action: "put", reference: destination, expected: null, content: "Destination merge data.\n", provenance }));
  await h.b.git(["push", "--atomic", h.destinationDirectory, "refs/arc/project/registry:refs/arc/project/registry", "refs/arc/user/andrew/personal:refs/arc/user/andrew/personal"]);
  success(await h.store.write({ action: "put", reference: source, expected: null, content: "Source merge data.\n", provenance }));
  success(await h.store.push());
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const advisory = { condition: "Inspect the combined source and destination documents.", remedy: { text: "Save the combined documents." } };
  const check: WriteCheck = async ({ reference }) => reference.key === "source.md" ? [{ rule: "combined-documents", ...advisory }] : [];
  const ports = { ...h.ports, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } } };
  const trial = await invokeStoreMigrate(["--to", h.to, "--trial"], ports);
  expect(trial.status, JSON.stringify(trial)).toBe("ok");
  if (trial.status === "ok") expect(trial.result.notices).toContainEqual(expect.objectContaining({ remedy: advisory.remedy, condition: expect.stringContaining(advisory.condition) }));
  await expect(invokeStoreMigrate(["--to", h.to], { ...ports, migrateStep: async step => {
    if (step === "remote.forwarded") throw new Error("Paused merged copy");
  } })).rejects.toThrow("Paused merged copy");
  const resumed = await invokeStoreMigrate([], ports);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  if (resumed.status === "ok") expect(resumed.result.notices).toContainEqual(expect.objectContaining({ remedy: advisory.remedy, condition: expect.stringContaining(advisory.condition) }));
  success(await h.store.pull());
  expect(success(await h.store.read({ reference: destination })).content).toBe("Destination merge data.\n");
  expect(success(await h.store.read({ reference: source })).content).toBe("Source merge data.\n");
}, 60_000);
