import { describe, it, expect } from "vitest";

import {
  composePointerRecord,
  type PointerRecordInput,
} from "../../../src/lib/work-unit/pointer-record.js";

const BASE_INPUT: PointerRecordInput = {
  name: "lifecycle-transition-core",
  branch: "feat/lifecycle-transition-core",
  reason: "blocked on upstream ADR-022 sign-off",
  renderFields: { Owner: "andrew", Class: "Feature", Priority: "P1" },
};

describe("composePointerRecord", () => {
  it("opens with the `**Parked**` derived-state callout naming the authoritative branch", () => {
    const out = composePointerRecord(BASE_INPUT);
    // The callout must be the very first thing in the file, above the H1, so the
    // meta parser (which reads from the H1 down) ignores it.
    expect(out.startsWith("> **Parked**")).toBe(true);
    expect(out).toContain(
      "> **Parked** — Active-phase work shelved here; authoritative artifacts on branch `feat/lifecycle-transition-core`.",
    );
  });

  it("renders the supplied park reason in the callout", () => {
    const out = composePointerRecord(BASE_INPUT);
    expect(out).toContain("> Reason: blocked on upstream ADR-022 sign-off");
  });

  it("carries the `do not hand-edit` regeneration guidance line", () => {
    const out = composePointerRecord(BASE_INPUT);
    expect(out).toContain("> Regenerated pointer — do not hand-edit.");
  });

  it("writes the literal `State: Active` into the core-block table", () => {
    const out = composePointerRecord(BASE_INPUT);
    // State renders as a backticked enum token in the hoisted core table.
    expect(out).toContain("`Active`");
    // And never the derived `parked`/`Parked` state as a stored meta value.
    expect(out).not.toContain("`Parked`");
    expect(out).not.toContain("`parked`");
  });

  it("forces State to `Active` even when renderFields supplies a conflicting State", () => {
    const out = composePointerRecord({
      ...BASE_INPUT,
      renderFields: { ...BASE_INPUT.renderFields, State: "Provisional" },
    });
    expect(out).toContain("`Active`");
    expect(out).not.toContain("`Provisional`");
  });

  it("forces the authoritative Branch into the core table even against a conflicting renderField", () => {
    const out = composePointerRecord({
      ...BASE_INPUT,
      renderFields: { ...BASE_INPUT.renderFields, Branch: "wrong/branch" },
    });
    expect(out).toContain("`feat/lifecycle-transition-core`");
    expect(out).not.toContain("wrong/branch");
  });

  it("renders the WU name as the meta H1 and carries supplied render fields", () => {
    const out = composePointerRecord(BASE_INPUT);
    expect(out).toContain("# Metadata: lifecycle-transition-core");
    expect(out).toContain("`andrew`");
    expect(out).toContain("`Feature`");
    expect(out).toContain("`P1`");
  });

  it("separates the callout from the meta with a blank line and terminates with a single newline", () => {
    const out = composePointerRecord(BASE_INPUT);
    expect(out).toContain(
      "> Regenerated pointer — do not hand-edit.\n\n# Metadata: lifecycle-transition-core",
    );
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});
