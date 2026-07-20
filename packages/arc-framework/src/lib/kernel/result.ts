/**
 * Bounded Result exports for typed success and failure composition.
 *
 * Keeping the dependency edge here gives callers one stable import path while
 * preserving neverthrow's ordinary Result method API.
 */

export {
  ResultAsync,
  err,
  errAsync,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  okAsync,
  type Result,
} from "neverthrow";
