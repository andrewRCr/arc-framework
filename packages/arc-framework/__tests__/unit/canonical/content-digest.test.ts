import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  type StoredBlobReader,
  contentDigest,
  deleteOperation,
  patchDigest,
  resolveArtifactEntry,
  writeOperation,
} from "../../../src/lib/canonical/content-digest.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const path = validateManagedPath("dir/file.txt");

describe("content digests over stored bytes", () => {
  it("hashes clean-filtered stored bytes, so LF and CRLF checkouts of one blob share a digest", () => {
    // Git's clean filter normalizes CRLF -> LF on stage; the stored blob is identical either way.
    const storedFromLfCheckout = encode("first\nsecond\n");
    const storedFromCrlfCheckout = encode("first\r\nsecond\r\n".replace(/\r\n/gu, "\n"));

    expect(contentDigest(storedFromLfCheckout)).toBe(contentDigest(storedFromCrlfCheckout));
    // The digest is byte-sensitive, so invariance must come from reading stored bytes, not from the hash.
    expect(contentDigest(encode("first\r\nsecond\r\n"))).not.toBe(contentDigest(storedFromLfCheckout));
  });

  it("resolves a present artifact-set entry as exactly { path, state, contentDigest }", () => {
    const reader: StoredBlobReader = () => encode("payload");

    expect(resolveArtifactEntry(path, reader)).toEqual({
      path,
      state: "present",
      contentDigest: contentDigest(encode("payload")),
    });
  });

  it("resolves an absent path to { path, state: 'absent' } with no digest, never a zero-byte digest", () => {
    const reader: StoredBlobReader = () => null;
    const entry = resolveArtifactEntry(path, reader);

    expect(entry).toEqual({ path, state: "absent" });
    expect(entry).not.toHaveProperty("contentDigest");
    expect(entry).not.toEqual({
      path,
      state: "present",
      contentDigest: contentDigest(new Uint8Array()),
    });
  });

  it("builds a write patch operation as exactly { operation, path, contentDigest }", () => {
    expect(writeOperation(path, encode("payload"))).toEqual({
      operation: "write",
      path,
      contentDigest: contentDigest(encode("payload")),
    });
  });

  it("builds a delete patch operation as exactly { operation, path }", () => {
    const op = deleteOperation(path);

    expect(op).toEqual({ operation: "delete", path });
    expect(op).not.toHaveProperty("contentDigest");
  });

  it("shares the sha256:+64-hex wire format with structured digests", () => {
    expect(contentDigest(encode("x"))).toMatch(/^sha256:[0-9a-f]{64}$/u);
    // Same wire format, different inputs: raw content byte "x" vs the canonical JSON string "x" ('"x"').
    expect(contentDigest(encode("x"))).not.toBe(canonicalDigest("x"));
  });

  it("digests patch operations independently of input order", () => {
    const otherPath = validateManagedPath("other.txt");
    const operations = [deleteOperation(path), writeOperation(otherPath, encode("payload"))];

    expect(patchDigest(operations)).toBe(patchDigest([...operations].reverse()));
  });

  it("rejects duplicate patch paths", () => {
    expect(() => patchDigest([deleteOperation(path), writeOperation(path, encode("payload"))])).toThrow(
      "duplicate patch path",
    );
  });
});
