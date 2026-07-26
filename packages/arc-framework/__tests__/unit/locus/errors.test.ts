/** Boundary classification coverage for locus-domain errors. */

import { describe, expect, it } from "vitest";

import { LocusError, toLocusErrorPayload } from "../../../src/lib/locus/errors.js";

describe("locus errors", () => {
  it("projects every local error through the operational error payload", () => {
    const error = new LocusError("read failed", "locus.persistence.read");
    expect(toLocusErrorPayload(error)).toEqual({ code: "locus.persistence.read", message: "read failed" });
  });

  it("classifies unknown failures at the caller-owned boundary", () => {
    expect(toLocusErrorPayload(new Error("unsafe"), {
      code: "locus.mutation.failed",
      message: "Mutation failed",
    })).toEqual({ code: "locus.mutation.failed", message: "Mutation failed" });
  });
});
