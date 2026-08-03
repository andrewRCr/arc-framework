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
      expect(reference).toContain("arc errand close <slug> [--force] [--json]");
      expect(reference).toContain("arc errand abandon <slug> [--json]");
      expect(reference).toContain(
        "arc errand promote <slug> [--name <name>] [--type <type>] "
          + "--floor <derivation|scale> [--json]",
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

      expect(init).toContain("locusState: Probe<LocusStateV1>");
      expect(init).toContain("Dispatch only on `locusState.value.current`");
      expect(init).toContain("exact role row registered at the entering checkout");
      expect(init).toContain("`locusState.value.current.kind === \"none\"` → attach nothing");
      expect(init).toContain("a null lease is the normal ordinary-session state");
      expect(init).toContain(
        "select a second frame from branch shape, metas, the worktree list, or SESSION-NOTES",
      );
      expect(init).toContain("If the composite call itself fails, surface the failure and stop.");
      expect(init).not.toContain("Probe failure fallback");
      expect(init).not.toContain("`locusState.inFlightIdentities`");

      expect(handoff).toContain("dispatch only on `handoffLocus.value`");
      expect(handoff).toContain(
        'Use this path only for `handoffLocus.value.kind === "leave-errand"`',
      );
      expect(handoff).not.toContain("`handoffLocus.kind");
      expect(handoff).toContain("Never select the handoff subject from a branch prefix");
      expect(handoff).toContain("`release-work-unit` with null `leaseId` — release nothing");
      expect(handoff).toContain("If the composite call itself fails, surface the failure and stop.");
      expect(handoff).not.toContain("Probe failure fallback");

      expect(recovery).toContain("required `recover.locusState` is the sole topology/frame read");
      expect(recovery).toContain("dispatching only on `report.recover.recoveryFrame.value`");
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

  it("describes the ordinary work-unit locus as normally unleased", async () => {
    for (const base of [packageArc, projectArc]) {
      const briefing = await readFile(
        resolve(base, "reference/briefs/AGENT-BRIEF.ARC.md"),
        "utf8",
      );

      expect(briefing).toContain("optional, verb-scoped lease");
      expect(briefing).toContain("an ordinary live WU role is\n  normally unleased");
      expect(briefing).not.toContain("session-scoped lease");
    }
  });
});
