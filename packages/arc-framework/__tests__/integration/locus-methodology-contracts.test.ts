import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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
      expect(reference).toContain(
        "arc errand open <slug> [--intent <text>] [--from-inbox <entry>] "
          + "[--inbox-title-file <path|->] [--json]",
      );
      expect(reference).toContain(
        "arc errand link <slug> (--from-inbox <entry> | --inbox-title-file <path|->) [--json]",
      );
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

  it("keeps frame selection reader-owned across init, recovery, and handoff", async () => {
    for (const base of [packageArc, projectArc]) {
      const suffix = base === packageArc ? ".template.md" : ".md";
      const init = await readFile(
        resolve(base, `system/workflows/arc/session-lifecycle/session-init${suffix}`),
        "utf8",
      );
      const handoff = await readFile(
        resolve(base, `system/workflows/arc/session-lifecycle/session-handoff${suffix}`),
        "utf8",
      );
      const recovery = await readFile(
        resolve(base, "system/workflows/arc/session-lifecycle/session-recover.md"),
        "utf8",
      );

      expect(init).toContain("required `derivedLocusState` slot is the sole session-frame");
      expect(init).toContain("Dispatch only on `derivedLocusState.value.entering`");
      expect(init).toContain("with `derivedLocusState.value.active.context`");
      expect(init).toContain("free-primary\" | \"unmanaged-checkout\" | \"retired");
      expect(init).toContain(
        "Never select a second frame from branch shape, metas, another worktree scan, or SESSION-NOTES",
      );
      expect(init).toContain("If the composite call itself fails, surface the failure and stop.");
      expect(init).toContain(
        "arc errand materialize <slug> --claim-id <claimId> --expected-head <expectedHead> --json",
      );
      expect(init).not.toContain("Probe failure fallback");
      expect(init).not.toContain("`locusState.inFlightIdentities`");
      expect(init).toContain("whose subject is `groom` dispatches to");
      expect(init).toContain("whose subject is `housekeep` dispatches to");
      expect(init).not.toContain("partial-housekeep");

      expect(handoff).toContain("dispatch only on `handoffLocus.value`");
      expect(handoff).toContain(
        'Use this path only for `handoffLocus.value.kind === "leave-errand"`',
      );
      expect(handoff).not.toContain("`handoffLocus.kind");
      expect(handoff).toContain("Never select the handoff subject from a branch prefix");
      expect(handoff).toContain("`derivedLocusState`      | Required entering-checkout frame");
      expect(handoff).toContain("`release-work-unit` — write no generic locus state");
      expect(handoff).toContain("direct subsequent commands to the retained surviving checkout");
      expect(handoff).not.toContain("arc locus release");
      expect(handoff).not.toContain("`recordId`");
      expect(handoff).not.toContain("`leaseId`");
      expect(handoff).toContain("If the composite call itself fails, surface the failure and stop.");
      expect(handoff).not.toContain("Probe failure fallback");

      expect(recovery).toContain("required `recover.derivedLocusState` is the sole topology/frame read");
      expect(recovery).toContain("checkout path and optional\nmarker-parent path");
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

  it("routes same-session finalization through exact-head change-request resolution", async () => {
    for (const base of [packageArc, projectArc]) {
      const suffix = base === packageArc ? ".template.md" : ".md";
      const handoff = await readFile(
        resolve(base, `system/workflows/arc/session-lifecycle/session-handoff${suffix}`),
        "utf8",
      );

      expect(handoff).toContain(
        "arc review change-request resolve --head-ref <branch> --head-sha <head-sha> --json",
      );
      expect(handoff).toContain("`merged-at-head / complete` → **merged-clean**");
      expect(handoff).toContain("`open / reuse-change-request` → **still-pending**");
      expect(handoff).toContain("An unavailable local head is **failed / blocked**");
      expect(handoff).not.toContain("gh pr view <branch> --json state,mergedAt");
    }
  });

  it("preserves typed cleanup guidance without promising an unproduced Errand queue", async () => {
    for (const base of [packageArc, projectArc]) {
      const suffix = base === packageArc ? ".template.md" : ".md";
      const [init, probeEnvelope] = await Promise.all([
        readFile(
          resolve(base, `system/workflows/arc/session-lifecycle/session-init${suffix}`),
          "utf8",
        ),
        readFile(
          resolve(base, "system/workflows/arc/session-lifecycle/session-init/probe-envelope.md"),
          "utf8",
        ),
      ]);

      expect(init).toContain("`currentHusk.ok == true` AND `currentHusk.value != null`");
      expect(init).toContain("`sweep.value.worktrees` non-empty");
      expect(init).toContain("`orphanBranchSweep.value.orphans` non-empty");
      expect(init).toContain("render one combined\n  section instead of the primary-only sections above");
      for (const surface of [init, probeEnvelope]) {
        expect(surface).not.toContain("pendingExecuteBound");
        expect(surface).not.toContain("executeBoundDiagnostics");
      }
      expect(probeEnvelope).toContain("counts routable (well-formed, non-held) `USER-INBOX` entries");
      expect(probeEnvelope).not.toContain("non-execute-bound");
    }
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

  it("routes housekeep execution ordering through one lock-safe batch command", async () => {
    for (const base of [packageArc, projectArc]) {
      const drainInbox = await readFile(
        resolve(base, "system/workflows/arc/supplemental/drain-inbox.md"),
        "utf8",
      );

      expect(drainInbox).toContain("`arc user inbox-mark-execute-bound <file | ->`");
      expect(drainInbox).toContain('"orderedTitles"');
      expect(drainInbox).toContain("final file order");
      expect(drainInbox).not.toContain("add `_Disposition:_ `execute-bound`` by hand");
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
        expect(workflow).toContain("`settlement.state: commit-required`");
        expect(workflow).toContain("`settlement.state: settled`");
      }
      expect(initWorkUnit).toContain("same exact\n   `subject` and `generation`");
      expect(initWorkUnit).toContain("immutable `Promotion Receipt`");
      expect(initWorkUnit).not.toContain("retires the errand record");
      expect(initWorkUnit).not.toContain("backed by a record");
    }
  });

  it("keeps only Errand entry on the durable transient path", async () => {
    for (const base of [packageArc, projectArc]) {
      const suffix = base === packageArc ? ".template.md" : ".md";
      const init = await readFile(
        resolve(base, `system/workflows/arc/session-lifecycle/session-init${suffix}`),
        "utf8",
      );

      expect(init).toContain("`--errand` — invoke `arc errand open`");
      expect(init).toContain(
        "`--housekeep` / `--plan` — run the selected workflow's write-context preflight",
      );
      expect(init).toContain("do not create a durable transient role");
    }
  });

  it("stops materialization unless the returned Errand generation and checkout are exact", async () => {
    for (const base of [packageArc, projectArc]) {
      const suffix = base === packageArc ? ".template.md" : ".md";
      const init = await readFile(
        resolve(base, `system/workflows/arc/session-lifecycle/session-init${suffix}`),
        "utf8",
      );

      expect(init).toMatch(
        /If the result is refused or reports an error, render its\s+diagnostic and stop\./u,
      );
      expect(init).toMatch(
        /returned `identity\.key`,\s+`identity\.claimId`, and `identity\.branch` exactly match the selected candidate/u,
      );
      expect(init).toMatch(/non-null\s+`allocation`/u);
      expect(init).toMatch(
        /row's checkout path equals the returned `allocation\.checkoutPath` and its role subject carries the same claim ID/u,
      );
    }
  });

  it("defines locus authority from checkout topology, markers, lifecycle, and identity", async () => {
    for (const base of [packageArc, projectArc]) {
      const briefing = await readFile(
        resolve(base, "reference/briefs/AGENT-BRIEF.ARC.md"),
        "utf8",
      );

      expect(briefing).toContain("One registered checkout plus the ARC role derived from its marker");
      expect(briefing).toMatch(/tracked lifecycle, transient\s+identity, and Git topology/u);
      expect(briefing).toContain("The physical primary is the launchpad only while its marker is absent");
      expect(briefing).not.toMatch(/locus record|record-free|optional, verb-scoped lease|normally unleased/u);
    }
  });

  it("contains no retired locus mutation or liveness instructions", async () => {
    for (const base of [packageArc, projectArc]) {
      const suffix = base === packageArc ? ".template.md" : ".md";
      const surfaces = await Promise.all([
        readFile(resolve(base, "system/workflows/arc/supplemental/run-errand.md"), "utf8"),
        readFile(resolve(base, "system/workflows/arc/work-unit-lifecycle/resume-work-unit.md"), "utf8"),
        readFile(resolve(base, "system/workflows/arc/session-lifecycle/session-init/probe-envelope.md"), "utf8"),
        readFile(resolve(base, "reference/strategies/arc/strategy-concurrent-work.md"), "utf8"),
        readFile(resolve(base, "reference/strategies/arc/strategy-work-organization.md"), "utf8"),
        readFile(resolve(base, `system/workflows/arc/session-lifecycle/session-init${suffix}`), "utf8"),
      ]);

      for (const surface of surfaces) {
        expect(surface).not.toMatch(
          /arc locus (?:attach|release|resolve)|--confirm-no-live-session|session locus record|dead lease|live lease|record-free/u,
        );
      }
    }
  });
});
