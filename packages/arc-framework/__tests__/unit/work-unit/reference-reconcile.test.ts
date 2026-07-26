/**
 * Observable reference-reconcile planning over authenticated retirement history.
 */

import { describe, expect, it } from "vitest";

import {
  planReferenceReconcile,
  type ReachableReferenceTransition,
} from "../../../src/lib/work-unit/reference-reconcile.js";

function rename(subject: string, targetSlug: string): ReachableReferenceTransition {
  return { subject, outcome: { kind: "rename", targetSlug } };
}

describe("planReferenceReconcile", () => {
  it("composes a unique rename chain into one final structured edit", () => {
    const result = planReferenceReconcile({
      transitions: [rename("origin", "middle"), rename("middle", "final")],
      artifacts: [{
        path: ".arc/active/spec-dependent.md",
        content: "See `spec-origin.md` and origin for context.\n",
      }],
    });

    expect(result).toMatchObject({
      status: "ready",
      edits: [{
        path: ".arc/active/spec-dependent.md",
        replacements: [{ subject: "origin", targetSlug: "final" }],
      }],
      advisories: [{
        path: ".arc/active/spec-dependent.md",
        line: 1,
        referenceKind: "narrative",
        subject: "origin",
        suggestedDisposition: "review-rename",
      }],
    });
    expect(result.edits[0]?.content).toBe("See `spec-final.md` and origin for context.\n");
  });

  it("refuses ambiguous and cyclic rename histories without edits", () => {
    const ambiguous = planReferenceReconcile({
      transitions: [rename("origin", "one"), rename("origin", "two")],
      artifacts: [{ path: "spec-dependent.md", content: "See `spec-origin.md`.\n" }],
    });
    const cyclic = planReferenceReconcile({
      transitions: [rename("origin", "middle"), rename("middle", "origin")],
      artifacts: [{ path: "spec-dependent.md", content: "See `spec-origin.md`.\n" }],
    });

    expect(ambiguous).toMatchObject({
      status: "conflict",
      edits: [],
      conflicts: [{ subject: "origin", reason: "ambiguous-history" }],
    });
    expect(cyclic).toMatchObject({
      status: "conflict",
      edits: [],
      conflicts: [{ subject: "origin", reason: "rename-cycle" }],
    });
  });

  it("does not let unrelated ambiguous history block the current artifact group", () => {
    const result = planReferenceReconcile({
      transitions: [
        rename("origin", "successor"),
        rename("unrelated", "one"),
        rename("unrelated", "two"),
      ],
      artifacts: [{ path: "spec-dependent.md", content: "See `spec-origin.md`.\n" }],
    });

    expect(result).toMatchObject({
      status: "ready",
      conflicts: [],
      edits: [{ content: "See `spec-successor.md`.\n" }],
    });
  });

  it("uses the ARC slug alphabet boundary and excludes structured code spans from prose findings", () => {
    const result = planReferenceReconcile({
      transitions: [rename("arc", "framework")],
      artifacts: [{
        path: "notes-dependent.md",
        content: "arc arc-framework pre-arc (arc) `notes-arc.md`\n",
      }],
    });

    expect(result.advisories.map(({ context, referenceKind }) => ({ context, referenceKind }))).toEqual([
      {
        context: "arc arc-framework pre-arc (arc) `notes-arc.md`",
        referenceKind: "narrative",
      },
      {
        context: "arc arc-framework pre-arc (arc) `notes-arc.md`",
        referenceKind: "narrative",
      },
    ]);
    expect(result.edits[0]?.content).toBe(
      "arc arc-framework pre-arc (arc) `notes-framework.md`\n",
    );
  });

  it("surfaces decomposed artifact references as dangling without guessing a target", () => {
    const result = planReferenceReconcile({
      transitions: [{ subject: "origin", outcome: { kind: "decompose" } }],
      artifacts: [{
        path: "spec-dependent.md",
        content: "Compare `spec-origin.md`.\n",
      }],
    });

    expect(result).toMatchObject({
      status: "ready",
      edits: [],
      advisories: [{
        referenceKind: "dangling-artifact",
        subject: "origin",
        suggestedDisposition: "remove-or-retarget",
      }],
    });
  });
});
