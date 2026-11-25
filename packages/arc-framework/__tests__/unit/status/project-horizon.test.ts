/** A pause takes precedence over every lifecycle routing horizon. */
import { expect, it } from "vitest";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { projectHorizonAdvisory } from "../../../src/lib/status/project-horizon.js";

it.each(["parked", "provisional", "planned", "planning", "active", "shipped"] as const)(
  "reports pause before the %s horizon", state => {
    const pause = MetaPauseSchema.parse({ pausedBy: "andrew", since: "2026-01-02T03:04:05.000Z", reason: "Waiting" });
    const record = { slug: "paused", priority: "P3" as const, scheduling: "parked" as const, pause };
    expect(projectHorizonAdvisory(record, state)).toBe(
      "`paused` is paused (P3); an entry routed here waits for its resumption. Resume it or send a separable part now?",
    );
  },
);
