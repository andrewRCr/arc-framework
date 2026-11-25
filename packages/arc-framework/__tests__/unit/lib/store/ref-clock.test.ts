import { describe, expect, it } from "vitest";

import { createRefClock } from "../../../helpers/store/ref-clock.js";

describe("ref backend virtual time", () => {
  it("fires earlier bounds in end order before a later retry wait resolves", async () => {
    const fake = createRefClock(new Date(0));
    const signal = new AbortController().signal;
    const events: string[] = [];
    const late = fake.sleep.bound(15, signal).then(() => events.push("late"));
    const early = fake.sleep.bound(5, signal).then(() => events.push("early"));
    await fake.sleep.wait(20, signal).then(() => events.push("wake"));
    await Promise.all([late, early]);
    expect(events).toEqual(["early", "late", "wake"]);
    expect(fake.clock().getTime()).toBe(21);
  });

  it("leaves a bound pending without moving time until explicit advancement", async () => {
    const fake = createRefClock(new Date(0));
    let finished = false;
    const pending = fake.sleep.bound(10, new AbortController().signal).then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(fake.clock().getTime()).toBe(1);
    expect(fake.clock().getTime()).toBe(2);
    fake.advance(7);
    await Promise.resolve();
    expect(finished).toBe(false);
    fake.advance(1);
    await pending;
    expect(finished).toBe(true);
  });

  it("ends a canceled bound and an already-canceled wait without advancing time", async () => {
    const fake = createRefClock(new Date(0));
    const controller = new AbortController();
    const pending = fake.sleep.bound(100, controller.signal);
    controller.abort();
    await pending;
    await fake.sleep.wait(100, controller.signal);
    expect(fake.clock().getTime()).toBe(1);
    await fake.sleep.bound(100, controller.signal);
    expect(fake.clock().getTime()).toBe(2);
  });
});
