/** Opaque claim tokens shared by markers and operational state. */

import { z } from "zod";

/** At-least-128-bit lowercase hexadecimal or unpadded base64url token. */
export const LocusTokenSchema = z.string().max(512).refine((value) =>
  /^(?:[0-9a-f]{32,}|[A-Za-z0-9_-]{22,})$/u.test(value), {
  error: "Token must encode at least 128 bits as lowercase hex or unpadded base64url",
});
