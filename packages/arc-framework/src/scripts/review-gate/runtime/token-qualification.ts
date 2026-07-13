/** Token-opaque orchestration for qualification-only forced-format probes. */

import type { InstallationTokenQualification } from "../hosts/github/token-qualification.js";

export type ForcedTokenFormat = "stateless" | "classic";

export interface MintedQualificationToken {
  token: string;
  observedFormat: ForcedTokenFormat;
}

export interface SanitizedTokenProbe {
  requestedFormat: ForcedTokenFormat;
  observedFormat: ForcedTokenFormat;
  authority: InstallationTokenQualification;
}

export interface TokenQualificationResult {
  schemaVersion: 1;
  status: "qualified";
  probes: [SanitizedTokenProbe, SanitizedTokenProbe];
}

/** Mint both temporary formats, pass each opaquely to the exact consumer, and discard the credentials. */
export async function runTokenQualification(deps: {
  mint(format: ForcedTokenFormat): Promise<MintedQualificationToken>;
  consume(token: string): Promise<InstallationTokenQualification>;
}): Promise<TokenQualificationResult> {
  const probes: SanitizedTokenProbe[] = [];
  for (const requestedFormat of ["stateless", "classic"] as const) {
    try {
      const minted = await deps.mint(requestedFormat);
      if (minted.observedFormat !== requestedFormat) throw new Error("format override was not honored");
      const authority = await deps.consume(minted.token);
      probes.push({ requestedFormat, observedFormat: minted.observedFormat, authority });
    } catch (cause) {
      throw new Error(`token-qualification:${requestedFormat}-probe-failed`, { cause });
    }
  }
  const [stateless, classic] = probes;
  if (stateless === undefined || classic === undefined
    || JSON.stringify(stateless.authority) !== JSON.stringify(classic.authority)) {
    throw new Error("token-qualification:format-authority-mismatch");
  }
  return { schemaVersion: 1, status: "qualified", probes: [stateless, classic] };
}
