/** Shared injected-fetch fakes for the GitHub API boundary suites. */

import type { HttpFetch, HttpRequestInit, HttpResponse } from "../../../../../../../src/scripts/review-gate/hosts/github/api/http.js";

/** One scripted transport step: a response, or a rejection to simulate a network failure. */
export type FetchStep = HttpResponse | { throw: unknown };

/** A recorded fetch invocation. */
export interface RecordedCall {
  url: string;
  init: HttpRequestInit;
}

/** A scripted fetch plus the calls it recorded and the backoff sleeps it slept. */
export interface FetchFake {
  fetch: HttpFetch;
  calls: RecordedCall[];
  sleeps: number[];
  sleep: (ms: number) => Promise<void>;
}

/** Build an `HttpResponse` with a case-insensitive header accessor. */
export function response(status: number, body: string, headers: Record<string, string> = {}): HttpResponse {
  const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status,
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
    text: () => Promise.resolve(body),
  };
}

/** A network-error step (rejects the fetch). */
export function networkError(message = "socket hang up"): FetchStep {
  return { throw: new Error(message) };
}

/** An abort-error step (rejects with an `AbortError`, read by the transport as a timeout). */
export function abortError(): FetchStep {
  const error = new Error("aborted");
  error.name = "AbortError";
  return { throw: error };
}

/** Build a fetch fake that replays `steps` in order, recording calls and sleeps. */
export function fetchFake(steps: FetchStep[]): FetchFake {
  const calls: RecordedCall[] = [];
  const sleeps: number[] = [];
  let index = 0;
  return {
    calls,
    sleeps,
    sleep: (ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    fetch: (url: string, init: HttpRequestInit) => {
      calls.push({ url, init });
      const step = steps[index];
      index += 1;
      if (step === undefined) throw new Error(`unexpected fetch call ${index} to ${url}`);
      if ("throw" in step) return Promise.reject(step.throw);
      return Promise.resolve(step);
    },
  };
}
