/** Fresh checkout-local evidence shared by writable and provisional root bindings. */
import { readCheckoutLayoutContext } from "../checkout-layout.js";
import { readProjectionConfiguration } from "./configuration.js";
import { captureProjectionLocal } from "./local-capture.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ProjectionLocation } from "./location.js";
import type { WriteBackContext } from "./write-back.js";
import { interpretProjectionView } from "./view-settings.js";

/** Bind each admission capture to the file-holding checkout, including its fresh identity, claim, and layout. */
export function createProjectionLocalCapture(input: {
  checkout: string; ports: ProjectionEnginePorts; location: ProjectionLocation;
}): NonNullable<WriteBackContext["captureLocal"]> {
  return async (path, source) => {
    const [fresh, selected] = await Promise.all([readProjectionConfiguration(input.ports.exec, input.checkout),
      readCheckoutLayoutContext(input.checkout, { fresh: true })]);
    if (fresh.identity.status !== "identified") return { status: "refused", refusal: { code: "record-malformed",
      class: "recoverable", rule: "projection.local", condition: "The editing identity is no longer configured.", remedy: fresh.identity.remedy } };
    return captureProjectionLocal({ checkout: input.checkout, path, source, location: input.location, settings: {
      identity: fresh.identity.identity, claim: selected.claim, layoutActive: selected.layoutActive, view: interpretProjectionView(fresh.view).view } });
  };
}
