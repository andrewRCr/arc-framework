/** Exact-generation agreement between a caller's selection and a driver's own occupancy read. */

import { describe, expect, it } from "vitest";

import { selectedGenerationMismatch } from "../../../src/lib/locus/selected-generation.js";

const RECORD_ID = `sha256:${"1".repeat(64)}`;
const LEASE_ID = "3".repeat(32);
const CHANGED_MESSAGE = `The selected generation ${RECORD_ID} changed before dispatch; re-select it before retrying.`;

describe("selectedGenerationMismatch", () => {
  it("agrees when the driver re-derived the exact selected generation", () => {
    expect(selectedGenerationMismatch(
      { recordId: RECORD_ID, leaseId: LEASE_ID },
      { recordId: RECORD_ID, leaseId: LEASE_ID },
    )).toBeNull();
  });

  it("reports no mismatch when no selection was carried in", () => {
    expect(selectedGenerationMismatch(undefined, null)).toBeNull();
    expect(selectedGenerationMismatch(undefined, { recordId: RECORD_ID, leaseId: LEASE_ID })).toBeNull();
  });

  it("reports absence rather than treating a vanished selection as already done", () => {
    expect(selectedGenerationMismatch({ recordId: RECORD_ID, leaseId: LEASE_ID }, null))
      .toContain(RECORD_ID);
  });

  it("reports a checkout the caller did not select", () => {
    expect(selectedGenerationMismatch(
      { recordId: RECORD_ID, leaseId: LEASE_ID },
      { recordId: `sha256:${"2".repeat(64)}`, leaseId: LEASE_ID },
    )).toBe(CHANGED_MESSAGE);
  });

  it("reports a newer lease generation at the selected checkout", () => {
    expect(selectedGenerationMismatch(
      { recordId: RECORD_ID, leaseId: LEASE_ID },
      { recordId: RECORD_ID, leaseId: "4".repeat(32) },
    )).toBe(CHANGED_MESSAGE);
  });

  it("reports an occupancy that carries no lease generation at all", () => {
    expect(selectedGenerationMismatch(
      { recordId: RECORD_ID, leaseId: LEASE_ID },
      { recordId: RECORD_ID, leaseId: null },
    )).toBe(CHANGED_MESSAGE);
  });
});
