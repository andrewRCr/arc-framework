import { describe, expect, it } from "vitest";

import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import type { LocusIdentityV1 } from "../../../src/lib/locus/schema/index.js";
import {
  locusOwnsBranch,
  locusWorkUnitAtPath,
} from "../../../src/lib/session-init/locus-classification.js";

const commonIdentity = {
  claimId: "c".repeat(32),
  protection: "full" as const,
  state: "open" as const,
  savedHead: null,
  changeRequest: null,
};

describe("derived cleanup classification", () => {
  it.each<LocusIdentityV1>([
    {
      ...commonIdentity, kind: "errand", key: "ordinary", branch: "chore/ordinary", purpose: "errand",
      origin: "description", originEntry: null,
    },
    {
      ...commonIdentity, kind: "errand", key: "routing", branch: "chore/routing", purpose: "housekeep-routing",
    },
    {
      ...commonIdentity, kind: "groom", key: "widget", branch: "chore/groom-widget", purpose: null,
      anchorStub: "widget", members: ["widget"], openedBaseHead: "a".repeat(40),
    },
  ])("protects the exact $purpose identity branch", (identity) => {
    const roster = [transientRow(identity)];
    expect(locusOwnsBranch(roster, identity.branch ?? "")).toBe(true);
    expect(locusOwnsBranch(roster, `${identity.branch ?? ""}-other`)).toBe(false);
  });

  it("resolves only the exact retained work-unit path", () => {
    const roster = [workUnitRow("archived", "/wt/archived")];
    expect(locusWorkUnitAtPath(roster, "/wt/archived")).toEqual({ name: "archived" });
    expect(locusWorkUnitAtPath(roster, "/wt/other")).toBeNull();
  });

  it("does not turn unresolved checkout evidence into branch ownership", () => {
    const unresolved: DerivedCheckoutRow = {
      ...baseRow("/wt/old", "feat/other"),
      kind: "unresolved-checkout",
      subject: { kind: "work-unit", key: "old" },
      diagnostics: [{ code: "branch-mismatch", message: "branch mismatch" }],
    };
    expect(locusOwnsBranch([unresolved], "feat/old")).toBe(false);
  });
});

function baseRow(path: string, branch: string | null) {
  return {
    checkout: { path, head: "a".repeat(40), branch, detached: branch === null, primary: false },
    markerGeneration: `sha256:${"b".repeat(64)}`,
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: "active" as const,
    diagnostics: [],
  };
}

function workUnitRow(name: string, path: string): DerivedCheckoutRow {
  return {
    ...baseRow(path, `feat/${name}`),
    kind: "work-unit",
    subject: { kind: "work-unit", key: name },
  };
}

function transientRow(identity: LocusIdentityV1): DerivedCheckoutRow {
  const kind = identity.kind === "errand" && identity.purpose === "housekeep-routing" ? "housekeep" : identity.kind;
  return {
    ...baseRow(`/wt/${identity.key}`, identity.branch),
    kind: "transient",
    identity,
    subject: { kind, key: identity.key, claimId: identity.claimId },
  } as DerivedCheckoutRow;
}
