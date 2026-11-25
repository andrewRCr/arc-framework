import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../helpers/soft-wrapped-prose.js";
import { createProductionSchemaRegistry } from "../../src/production-schema-registry.js";
import { lookupKernelSchema } from "../../src/lib/kernel/schema/generate.js";

const root = resolve(import.meta.dirname, "../../../..");
const packageArc = resolve(root, "packages/arc-framework/arc");
const projectArc = resolve(root, ".arc");

describe("locus methodology contracts", () => {
  it("publishes the current Errand lifecycle signature", async () => {
    const references = await Promise.all([
      readFile(resolve(packageArc, "reference/QUICK-REFERENCE.template.md"), "utf8"),
      readFile(resolve(projectArc, "reference/QUICK-REFERENCE.md"), "utf8"),
    ]);

    for (const reference of references) {
      expect(reference).toContain("arc errand next [--json]");
      expect(reference).toContain(
        "arc errand open <slug> [--intent <text>] [--from-inbox <personal|project>:<id>] [--isolate] [--json]",
      );
      expect(reference).toContain("arc errand link <slug> --from-inbox <personal|project>:<id> [--json]");
      expect(reference).toContain("arc errand queue set <file|->");
      expect(reference).not.toContain("--inbox-title-file");
      expect(reference).toContain(
        "arc errand materialize <slug> [--claim-id <claim-id> --expected-head <oid>] [--json]",
      );
      expect(reference).toContain(
        "arc errand leave <slug> --state <paused|awaiting-merge> "
          + "[--confirm-foreign-generation <generation>] [--json]",
      );
      expect(reference).toContain(
        "arc errand close <slug> [--confirm-foreign-generation <generation>] [--json]",
      );
      expect(reference).not.toContain("arc errand close <slug> [--force]");
      expect(reference).toContain(
        "arc errand abandon <slug> [--confirm-foreign-generation <generation>] [--json]",
      );
      expect(reference).toContain(
        "arc errand promote <slug> [--name <name>] [--type <type>] "
          + "--floor <derivation|scale> \\\n"
          + "  [--confirm-foreign-generation <generation>] [--json]",
      );
      expect(reference).not.toMatch(/arc errand open <slug>[^\n]*--type/u);
      expect(reference).not.toContain("arc errand retire");
      expect(reference).not.toContain("--inbox-entry-file");
    }
  });

  it("keeps frame selection reader-owned across recovery and handoff", async () => {
    for (const base of [packageArc, projectArc]) {
      const suffix = base === packageArc ? ".template.md" : ".md";
      const handoff = await readFile(
        resolve(base, `system/workflows/arc/session-lifecycle/session-handoff${suffix}`),
        "utf8",
      );
      const recovery = await readFile(
        resolve(base, "system/workflows/arc/session-lifecycle/session-recover.md"),
        "utf8",
      );

      expect(handoff).toContain("dispatch only on `handoffLocus.value`");
      expect(handoff).toMatch(
        softWrappedProse('Use this path only for `handoffLocus.value.kind === "leave-errand"`'),
      );
      expect(handoff).not.toContain("`handoffLocus.kind");
      expect(handoff).toMatch(softWrappedProse("Never select the handoff subject from a branch prefix"));
      expect(handoff).toContain("`derivedLocusState`      | Required entering-checkout frame");
      expect(handoff).toMatch(softWrappedProse("`release-work-unit` — write no generic locus state"));
      expect(handoff).toMatch(softWrappedProse("direct subsequent commands to the retained surviving checkout"));
      expect(handoff).toMatch(softWrappedProse("Its checkout stays held unless released (`arc locus release`)"));
      expect(handoff).not.toContain("`recordId`");
      expect(handoff).not.toContain("`leaseId`");
      expect(handoff).toMatch(softWrappedProse("If the composite call itself fails, surface the failure and stop."));
      expect(handoff).not.toContain("Probe failure fallback");

      expect(recovery).toMatch(softWrappedProse("required `recover.derivedLocusState` is the sole topology/frame read"));
      expect(recovery).toMatch(softWrappedProse("checkout path and optional marker-parent path"));
      expect(recovery).toContain("emits a return-to-base diagnostic");
      expect(recovery).not.toMatch(/recordId|leaseId|sessionHomePath|activeLocusPath/u);
      expect(recovery).toContain("dispatching only on `report.recover.recoveryFrame.value`");
    }
  });

  it("keeps handoff guidance free of retired lease doctrine", async () => {
    for (const base of [packageArc, projectArc]) {
      const skill = await readFile(resolve(base, "system/.internal/skills/arc-handoff/SKILL.md"), "utf8");

      expect(skill).toContain("exact terminal result");
      expect(skill).toContain("surviving checkout");
      expect(skill).not.toMatch(/lease|arc locus release/u);
    }
  });

  it("uses the surviving checkout's complete probe when an Errand returns to its parent work unit", async () => {
    for (const base of [packageArc, projectArc]) {
      const file = base === packageArc ? "session-handoff.template.md" : "session-handoff.md";
      const handoff = await readFile(resolve(base, "system/workflows/arc/session-lifecycle", file), "utf8");
      const errand = handoff.split("## Errand-Session Handoff Path")[1]?.split("\n## ")[0];
      expect(errand).toMatch(/arc status --session-handoff --json[\s\S]*complete probe[\s\S]*new baseline/u);
      expect(errand).toMatch(/new baseline[\s\S]*`release-work-unit`[\s\S]*matching WU or between-WUs path/u);
      expect(handoff).toMatch(softWrappedProse("if the `active` artifact slot disagrees, stop"));
      expect(handoff).toContain("arc handoff write -");
    }
  });

  it("stops before selecting a handoff path without an identity and gives the retry command", async () => {
    for (const base of [packageArc, projectArc]) {
      const file = base === packageArc ? "session-handoff.template.md" : "session-handoff.md";
      const handoff = await readFile(resolve(base, "system/workflows/arc/session-lifecycle", file), "utf8");
      expect(handoff.match(/^- `skipped \(no identity\).*$/mu)?.[0],
        "A missing identity stops dispatch before handoff confirmation").toBeUndefined();
      expect(handoff).toMatch(/`identity-missing`[\s\S]*surface[^.]*stop[\s\S]*git config arc\.identity <name>[\s\S]*retry/u);
    }
  });

  it("routes same-session finalization through exact-head change-request resolution", async () => {
    for (const base of [packageArc, projectArc]) {
      const suffix = base === packageArc ? ".template.md" : ".md";
      const handoff = await readFile(
        resolve(base, `system/workflows/arc/session-lifecycle/session-handoff${suffix}`),
        "utf8",
      );

      expect(handoff).toContain(
        "arc review change-request resolve --head-ref <branch> --head-sha <head-sha>",
      );
      expect(handoff).toContain("`merged-at-head / complete` → **merged-clean**");
      expect(handoff).toMatch(softWrappedProse(
        "`open / reuse-change-request`, or `ambiguous / stop` with `headAhead: true` (the open request lags only a "
        + "newer head that is unpushed or not yet seen by the host) → **still-pending**",
      ));
      expect(handoff).toMatch(softWrappedProse("`ambiguous / stop` without `headAhead` → **failed / blocked**"));
      expect(handoff).toMatch(softWrappedProse("An unavailable local head is **failed / blocked**"));
      expect(handoff).not.toContain("gh pr view <branch> --json state,mergedAt");
    }
  });

  it("keeps init guidance free of an unproduced Errand queue", async () => {
    for (const base of [packageArc, projectArc]) {
      const init = await readFile(resolve(base, "system/workflows/arc/session-lifecycle/session-init.md"), "utf8");
      expect(init).not.toContain("pendingExecuteBound");
      expect(init).not.toContain("executeBoundDiagnostics");
    }
  });

  it("sends an externally merged work unit through delivery closeout before teardown", async () => {
    for (const base of [packageArc, projectArc]) {
      const file = base === packageArc ? "session-handoff.template.md" : "session-handoff.md";
      const handoff = await readFile(resolve(base, "system/workflows/arc/session-lifecycle", file), "utf8");
      const arm = handoff.split("**work-unit candidate**")[1]?.split("**errand candidate")[0] ?? "";
      const firstAction = arm.match(/arc teardown|arc delivery closeout|merged-PR tail/iu)?.[0];
      expect(firstAction, "An archived terminal work unit may still have pending closeout").toBe("merged-PR tail");
      expect(arm).toMatch(/`targetRef\.repository`[\s\S]*`closed-out`[\s\S]*`blocked`[\s\S]*preserve the checkout/u);
    }
  });

  it("publishes routable inbox counts in the served envelope schema", () => {
    const servedSchema = lookupKernelSchema(createProductionSchemaRegistry(), "session-init-envelope");
    expect(servedSchema.status).toBe("found");
    if (servedSchema.status !== "found") throw Error("Missing envelope schema");
    const text = JSON.stringify(servedSchema.schema);
    expect(text).toContain("routable (well-formed, non-held) personal inbox entries");
    expect(text).toContain("excluding entries already execute-bound or queued");
    expect(text).toContain("execution-bound personal inbox entries identified by disposition or queue membership");
  });

  it("binds a returned sibling offer to its inbox capture", async () => {
    for (const base of [packageArc, projectArc]) {
      const runErrand = await readFile(
        resolve(base, "system/workflows/arc/supplemental/run-errand.md"),
        "utf8",
      );

      expect(runErrand).toContain("derive and confirm a branch-safe `<slug>`");
      expect(runErrand).toContain(
        "`arc errand open <slug> --from-inbox <nextOffer.key> --json`",
      );
    }
  });

  it("queues housekeep execution through the whole-queue setter by entry ID", async () => {
    for (const base of [packageArc, projectArc]) {
      const drainInbox = await readFile(
        resolve(base, "system/workflows/arc/supplemental/drain-inbox.md"),
        "utf8",
      );

      expect(drainInbox).toContain("`arc errand queue --json`");
      expect(drainInbox).toContain("`arc errand queue set <file | ->`");
      expect(drainInbox).toContain('"members":[{"inbox":"personal","id":"<queued-id>"}');
      expect(drainInbox).toMatch(softWrappedProse("keeping its members in order and appending each newly approved"));
      expect(drainInbox).not.toContain("inbox-mark-execute-bound");
      expect(drainInbox).not.toContain("orderedTitles");
    }
  });

  it("binds Errand promotion to exact receipt settlement", async () => {
    for (const base of [packageArc, projectArc]) {
      const runErrand = await readFile(
        resolve(base, "system/workflows/arc/supplemental/run-errand.md"),
        "utf8",
      );
      const initWorkUnit = await readFile(
        resolve(base, "system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md"),
        "utf8",
      );

      for (const workflow of [runErrand, initWorkUnit]) {
        expect(workflow).not.toContain("`settlement.state: commit-required`");
        expect(workflow).toContain("`settlement.state: settled`");
      }
      expect(initWorkUnit).toMatch(softWrappedProse("same exact `subject` and `generation`"));
      expect(initWorkUnit).toContain("immutable `Promotion Receipt`");
      expect(initWorkUnit).not.toContain("retires the errand record");
      expect(initWorkUnit).not.toContain("backed by a record");
    }
  });

  it("defines locus authority from the marker and the store", async () => {
    for (const base of [packageArc, projectArc]) {
      const briefing = await readFile(
        resolve(base, "reference/briefs/AGENT-BRIEF.ARC.md"),
        "utf8",
      );

      expect(briefing).toMatch(softWrappedProse("One registered checkout plus the ARC role derived from its marker and the store"));
      expect(briefing).toMatch(softWrappedProse("through exact teardown or release"));
      expect(briefing).not.toMatch(/tracked lifecycle, transient\s+identity, and Git topology/u);
      expect(briefing).toMatch(softWrappedProse("The physical primary is the launchpad only while its marker is absent"));
      expect(briefing).not.toMatch(/locus record|record-free|optional, verb-scoped lease|normally unleased/u);
    }
  });

  it("contains no retired locus mutation or liveness instructions", async () => {
    for (const base of [packageArc, projectArc]) {
      const surfaces = await Promise.all([
        readFile(resolve(base, "system/workflows/arc/supplemental/run-errand.md"), "utf8"),
        readFile(resolve(base, "reference/strategies/arc/strategy-concurrent-work.md"), "utf8"),
        readFile(resolve(base, "reference/strategies/arc/strategy-work-organization.md"), "utf8"),
        readFile(resolve(base, "system/workflows/arc/session-lifecycle/session-init.md"), "utf8"),
      ]);
      const resume = await readFile(resolve(base, "system/workflows/arc/work-unit-lifecycle/resume-work-unit.md"), "utf8");

      for (const surface of surfaces) {
        expect(surface).not.toMatch(
          /arc locus (?:attach|release|resolve)|--confirm-no-live-session|session locus record|dead lease|live lease|record-free/u,
        );
      }
      expect(resume).toMatch(softWrappedProse("exact teardown, or a release (`arc locus release`), removes its marker"));
      expect(resume).not.toMatch(
        /arc locus (?:attach|resolve)|--confirm-no-live-session|session locus record|dead lease|live lease|record-free/u,
      );
    }
  });
});
