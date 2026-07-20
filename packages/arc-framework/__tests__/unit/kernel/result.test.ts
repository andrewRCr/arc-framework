import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ResultAsync,
  err,
  errAsync,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  okAsync,
  type Result,
} from "../../../src/lib/kernel/index.js";

describe("kernel Result surface", () => {
  it("constructs and narrows synchronous success and failure values", () => {
    const success = ok<number, string>(42);
    const failure = err<number, string>("nope");

    expectTypeOf(success).toExtend<Result<number, string>>();
    expectTypeOf(failure).toExtend<Result<number, string>>();
    expect(success.isOk()).toBe(true);
    expect(failure.isErr()).toBe(true);
    if (success.isOk()) expect(success.value).toBe(42);
    if (failure.isErr()) expect(failure.error).toBe("nope");
  });

  it("constructs, transforms, and narrows asynchronous results", async () => {
    const success = ResultAsync.fromSafePromise<number, string>(Promise.resolve(42)).map((value) => value + 1);
    const failure = ResultAsync.fromPromise<number, string>(Promise.reject(new Error("nope")), (cause) =>
      cause instanceof Error ? cause.message : "unknown");

    expectTypeOf(success).toExtend<ResultAsync<number, string>>();
    expectTypeOf(failure).toExtend<ResultAsync<number, string>>();
    const successResult = await success;
    const failureResult = await failure;
    expect(successResult.isOk() && successResult.value).toBe(43);
    expect(failureResult.isErr() && failureResult.error).toBe("nope");
  });

  it("constructs immediate asynchronous successes and failures", async () => {
    const success = okAsync<number, string>(42);
    const failure = errAsync<number, string>("nope");

    expectTypeOf(success).toExtend<ResultAsync<number, string>>();
    expectTypeOf(failure).toExtend<ResultAsync<number, string>>();
    expect((await success).isOk()).toBe(true);
    expect((await failure).isErr()).toBe(true);
  });

  it("maps synchronous exceptions without changing successful values", () => {
    const thrown = { kind: "marker" };
    let observed: unknown;
    const safe = fromThrowable(
      (value: number, shouldThrow: boolean) => {
        if (shouldThrow) throw thrown;
        return value;
      },
      (cause) => {
        observed = cause;
        return "mapped" as const;
      },
    );

    const success = safe(42, false);
    const failure = safe(0, true);
    expect(success.isOk() && success.value).toBe(42);
    expect(failure.isErr() && failure.error).toBe("mapped");
    expect(observed).toBe(thrown);
  });

  it("maps synchronous throws and promise rejections from async boundaries", async () => {
    const syncThrown = { kind: "sync" };
    const rejected = { kind: "reject" };
    const observed: unknown[] = [];
    const safe = fromAsyncThrowable(
      (mode: "success" | "throw" | "reject"): Promise<number> => {
        if (mode === "throw") throw syncThrown;
        if (mode === "reject") return Promise.reject(rejected);
        return Promise.resolve(42);
      },
      (cause) => {
        observed.push(cause);
        return "mapped" as const;
      },
    );

    const success = await safe("success");
    const syncFailure = await safe("throw");
    const asyncFailure = await safe("reject");
    expect(success.isOk() && success.value).toBe(42);
    expect(syncFailure.isErr() && syncFailure.error).toBe("mapped");
    expect(asyncFailure.isErr() && asyncFailure.error).toBe("mapped");
    expect(observed).toEqual([syncThrown, rejected]);
  });
});
