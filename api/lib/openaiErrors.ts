/**
 * OpenAI failures with their status and code kept, and the sentences a user
 * sees when their own key is the problem. Pure: no client is built here.
 */

import type { Context } from "hono";
import { maskSecrets } from "./openaiKeyCheck.ts";

function field(err: unknown, name: "status" | "code"): unknown {
  return typeof err === "object" && err !== null
    ? (err as Record<string, unknown>)[name]
    : undefined;
}

/**
 * The SDK error is not kept as `cause`: its message and headers can carry part
 * of the key, and a logged cause would print them.
 */
export class OpenAIRequestError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(action: string, sdkError: unknown) {
    const detail = sdkError instanceof Error ? sdkError.message : "Unknown error";
    super(maskSecrets(`${action}: ${detail}`));
    this.name = "OpenAIRequestError";
    const status = field(sdkError, "status");
    const code = field(sdkError, "code");
    if (typeof status === "number") this.status = status;
    if (typeof code === "string") this.code = code;
  }
}

export const KEY_REJECTED = "Your OpenAI key was rejected. Update it in Settings.";
export const KEY_OUT_OF_CREDIT =
  "Your OpenAI account has hit its limit or has no credit left. Check your OpenAI billing, then try again.";
export const KEY_NO_MODEL =
  "Your OpenAI key cannot use the model this app needs. Check the key in Settings.";

export interface KeyFailure {
  status: 400 | 429;
  message: string;
}

/** Only for a call made with the user's own key; null for any other failure. */
export function userKeyFailure(err: unknown): KeyFailure | null {
  if (!(err instanceof OpenAIRequestError)) return null;
  const { status, code } = err;

  if (status === 401) return { status: 400, message: KEY_REJECTED };
  if (status === 429 || code === "insufficient_quota") {
    return { status: 429, message: KEY_OUT_OF_CREDIT };
  }
  if (status === 403 || status === 404 || code === "model_not_found") {
    return { status: 400, message: KEY_NO_MODEL };
  }
  return null;
}

export function keyFailureResponse(c: Context, own: boolean, error: unknown) {
  const failure = own ? userKeyFailure(error) : null;
  return failure
    ? c.json({ success: false, error: failure.message }, failure.status)
    : null;
}

/** What a failed background job writes to processing_error. */
export function failureText(error: unknown, own: boolean): string {
  const failure = own ? userKeyFailure(error) : null;
  if (failure) return failure.message;
  return error instanceof Error ? maskSecrets(error.message) : "Unknown error";
}
