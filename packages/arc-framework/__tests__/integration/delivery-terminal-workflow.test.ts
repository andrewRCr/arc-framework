import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { indexOfSoftWrappedProse, softWrappedPattern, softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const root = resolve(import.meta.dirname, "../../../..");

describe("delivery terminal integration handoff", () => {
  it("keeps package/project parity and one checkpoint interlock before merge and cleanup", async () => {
    const [packaged, installed] = await Promise.all([
      readFile(resolve(root, "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
      readFile(resolve(root, ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
    ]);
    expect(installed).toBe(packaged);
    expect(packaged).not.toContain("    - validate-criteria");
    expect(packaged).not.toContain("arc delivery terminal attach");
    expect(packaged.split("arc integrate checkpoint {name}")).toHaveLength(2);
    const interlockProse = softWrappedProse("`integration-interlock`: Stop after the ready evidence");
    const interlockPattern = new RegExp(`^>[ \t]+${interlockProse.source}`, `${interlockProse.flags}g`);
    expect([...packaged.matchAll(interlockPattern)]).toHaveLength(1);
    const checkpoint = packaged.indexOf("arc integrate checkpoint {name}");
    const interlock = indexOfSoftWrappedProse(packaged, "`integration-interlock`: Stop after the ready evidence", checkpoint);
    const merge = packaged.indexOf("arc integrate merge {name} --checkpoint {payload.checkpointHandle}");
    const resume = packaged.indexOf("**Skip the merge when the PR is already merged**");
    const close = packaged.indexOf("arc user close {name}", merge);
    const deliveryCloseout = packaged.indexOf("arc delivery closeout -", close);
    const teardown = packaged.indexOf("arc teardown <wu-name>", deliveryCloseout);
    for (const position of [checkpoint, interlock, merge, resume, close, deliveryCloseout, teardown]) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(checkpoint).toBeLessThan(interlock);
    expect(interlock).toBeLessThan(merge);
    expect(merge).toBeLessThan(resume);
    expect(merge).toBeLessThan(close);
    expect(resume).toBeLessThan(close);
    expect(close).toBeLessThan(deliveryCloseout);
    expect(packaged.slice(close, teardown)).toContain(
      '{"workUnitId":"{name}","repository":"{repositoryRef}","remote":"origin"}',
    );
    expect(packaged.slice(deliveryCloseout, teardown)).toMatch(
      /closed-out[\s\S]*recommendedActionText[\s\S]*blocked[\s\S]*recommendedActionText/iu,
    );
    expect(deliveryCloseout).toBeLessThan(teardown);
    const terminalRemedy = packaged.indexOf("`retarget` or `reopen-and-retarget`");
    const remedyInvocation = packaged.indexOf("remedy.argv", terminalRemedy);
    expect(packaged).not.toContain("`verify-terminal-member`");
    const baseMerge = indexOfSoftWrappedProse(packaged, "checkpoint's supplied `remedy.argv`", checkpoint);
    for (const position of [terminalRemedy, remedyInvocation, baseMerge]) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(terminalRemedy).toBeLessThan(remedyInvocation);
    expect(remedyInvocation).toBeLessThan(baseMerge);
  });

  it("dispatches canonical delivery intent before singleton resolution or push", async () => {
    const [packaged, installed, preparation, installedPreparation] = await Promise.all([
      readFile(
        resolve(root, "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
        "utf8",
      ),
      readFile(resolve(root, ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
      readFile(
        resolve(root, "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"),
        "utf8",
      ),
      readFile(resolve(root, ".arc/system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"), "utf8"),
    ]);
    expect(installed).toBe(packaged);
    expect(installedPreparation).toBe(preparation);
    const prePublication = preparation.indexOf("arc review pre-publication <wu>");
    const reservation = indexOfSoftWrappedProse(preparation, "hosted-first reservation", prePublication);
    const publication = preparation.indexOf("arc publish {name} --json", reservation);
    const integrationHandoff = indexOfSoftWrappedProse(preparation, "After the transition commit", publication);
    const status = packaged.indexOf("arc status {name} --json");
    const inspect = packaged.indexOf("arc delivery entry inspect -");
    const singletonResolution = packaged.indexOf("arc review change-request resolve --head-ref");
    const push = packaged.indexOf("**Push the WU branch upstream.**");

    for (const position of [
      prePublication,
      reservation,
      publication,
      integrationHandoff,
      status,
      inspect,
      singletonResolution,
      push,
    ]) expect(position).toBeGreaterThan(-1);
    expect(prePublication).toBeLessThan(reservation);
    expect(reservation).toBeLessThan(publication);
    expect(publication).toBeLessThan(integrationHandoff);
    expect(status).toBeLessThan(inspect);
    expect(inspect).toBeLessThan(singletonResolution);
    expect(inspect).toBeLessThan(push);
    expect(packaged).toContain('{"entryMode":"integrating"}');
    expect(packaged).toMatch(softWrappedPattern(/`not-applicable`[\s\S]*ordinary\s+singleton\s+integration/iu));
    expect(packaged).toMatch(
      softWrappedPattern(/`candidate-renewal-required`[\s\S]*`attestationAction`[\s\S]*requires\s+`unchanged`[\s\S]*without\s+replaying[\s\S]*verification/iu),
    );
    expect(packaged).toMatch(
      softWrappedPattern(/`candidate-verification-required`[\s\S]*verification\s+closeout[\s\S]*no[\s\S]*attestation\s+or\s+review\s+action/iu),
    );
    expect(packaged).toMatch(
      /`canonicalize-provisional`[\s\S]*`validate-canonical`[\s\S]*`continue-publication`[\s\S]*`resume-bound`/u,
    );
    expect(packaged).toContain("supplemental/deliver-stack.md");
    expect(packaged).toMatch(/`refused`[\s\S]*stop/iu);
  });
});
