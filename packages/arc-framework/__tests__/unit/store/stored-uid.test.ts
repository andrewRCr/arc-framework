import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OwnerIdentitySchema, STORED_UID_SOURCE } from "../../../src/lib/store/index.js";

describe("stored UID grammar", () => {
  it("matches exactly the lowercase UIDs an owner identity admits", () => {
    const pattern = new RegExp(`^${STORED_UID_SOURCE}$`, "u");
    for (const uid of [randomUUID(), "12345678-1234-4234-8234-123456789abc", "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff", "12345678-1234-0234-8234-123456789abc", "12345678-1234-9234-8234-123456789abc",
      "12345678-1234-4234-1234-123456789abc", "12345678-1234-4234-8234-123456789abg", "123456781234-4234-8234-123456789abc-",
      "------------------------------------"]) {
      expect(pattern.test(uid), uid).toBe(OwnerIdentitySchema.safeParse({ type: "work-item", name: "alpha", uid }).success);
    }
  });
});
