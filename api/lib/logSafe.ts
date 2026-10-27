export interface ErrorInfo {
  name?: string;
  status?: number | string;
  code?: string | number;
}

/**
 * The parts of an error that are safe to log. The message, stack and cause are
 * never read: OpenAI repeats part of the key in its error text, and parser or
 * database errors can repeat document text.
 */
export function errorInfo(error: unknown): ErrorInfo {
  if (typeof error !== "object" || error === null) return {};
  const { name, status, code } = error as Record<string, unknown>;
  const info: ErrorInfo = {};
  if (typeof name === "string") info.name = name;
  if (typeof status === "number" || typeof status === "string") info.status = status;
  if (typeof code === "string" || typeof code === "number") info.code = code;
  return info;
}
