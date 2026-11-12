/** A real import's retained records witness its consumed identity input after cleanup drops the source tips. */
import { expect, it } from "vitest";
import { importFixture } from "../helpers/store/import-fixture.js";
import { seedTransients, transientCommon, transientSourceRef, ordinaryErrand } from "../helpers/store/import-transients.js";
import { compareWindowConsumption } from "../../src/scripts/cutover-window/consumed.js";

it.each(["same", "different", "missing", "extra"] as const)("compares complete landed claim and Errand content after a real import (%s)", async mode => {
  const h = await importFixture();
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const claim = { ...transientCommon, kind: "groom" as const, slug: "groom-alpha", anchorStub: "alpha", members: ["alpha"],
    openedBaseHead: head, protection: "partial" as const, branch: null, state: "open" as const, changeRequest: null };
  const housekeep = { ...transientCommon, kind: "errand" as const, purpose: "housekeep-routing" as const, slug: "housekeep",
    branch: "chore/housekeep", state: "open" as const, savedHead: null, changeRequest: null };
  const held = await seedTransients(h, [claim, housekeep]);
  await h.git("git", ["update-ref", "refs/arc-window/local/" + transientSourceRef, held]);
  if (mode !== "same") {
    await h.git("git", ["update-ref", "-d", transientSourceRef, held]);
    await seedTransients(h, mode === "different" ? [{ ...claim, members: ["alpha", "beta"] }, housekeep, ordinaryErrand]
      : mode === "missing" ? [] : [claim, housekeep, { ...claim, slug: "groom-beta", anchorStub: "beta", members: ["beta"] }]);
  }
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/import/kept/"])).stdout).toBe("");
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const result = await compareWindowConsumption({ repo: h.root, exec: h.git }, { [transientSourceRef]: held });
  expect(result.regime).toBe("records");
  if (mode === "different") {
    expect(result.findings).toHaveLength(3);
    const report = result.findings.map(finding => finding.condition).join("\n");
    for (const text of [transientSourceRef, held, "claims/groom", "work-item/record", "work-item/description", "Keep this intent", "beta"])
      expect(report).toContain(text);
    expect(result.findings.every(finding => finding.subject === transientSourceRef)).toBe(true);
  } else if (mode === "same") expect(result.findings).toEqual([]);
  else {
    expect(result.findings).toHaveLength(mode === "missing" ? 2 : 1);
    const report = result.findings.map(finding => finding.condition).join("\n");
    expect(report).toContain(transientSourceRef);
    expect(report).toContain(held);
    expect(report).toContain("claims/groom");
    expect(report).toContain(mode === "missing" ? "claims/housekeep" : "groom-beta");
  }
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 60_000);

it("follows an interrupted real import from unconsumed input through retained tips to landed records without writes", async () => {
  const h = await importFixture();
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const held = await seedTransients(h, [{ ...transientCommon, kind: "groom", slug: "groom-alpha", anchorStub: "alpha",
    members: ["alpha"], openedBaseHead: head, protection: "partial", branch: null, state: "open", changeRequest: null }]);
  await h.git("git", ["update-ref", "refs/arc-window/local/" + transientSourceRef, held]);
  for (const [boundary, regime] of [["import.land", "unconsumed"], ["import.publish", "kept"]] as const) {
    h.ports.migrateStep = step => step === boundary ? Promise.reject(new Error("pause-import")) : Promise.resolve();
    await expect(h.migrate()).rejects.toThrow("pause-import");
    const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
    expect(await compareWindowConsumption({ repo: h.root, exec: h.git }, { [transientSourceRef]: held }))
      .toMatchObject({ regime, findings: [], identities: [{ ref: transientSourceRef, held, kept: regime === "kept" ? held : null }] });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  }
  h.ports.migrateStep = () => Promise.resolve();
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(await compareWindowConsumption({ repo: h.root, exec: h.git }, { [transientSourceRef]: held }))
    .toMatchObject({ regime: "records", findings: [] });
}, 60_000);
