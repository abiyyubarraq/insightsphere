import type { Context, MiddlewareHandler } from "hono";
import { AuthUnavailableError, supabaseService } from "./supabaseClient.ts";

export interface AuthUser {
  id: string;
  email?: string;
}

/**
 * Resolves the caller from the Authorization header.
 *
 * Returns null instead of throwing so handlers answer 401 rather than letting
 * an exception become a 500 — getUserFromToken throws on every failure path,
 * which is what made expired tokens look like server errors.
 *
 * Throws AuthUnavailableError when Auth itself could not answer.
 */
export async function getAuthUser(c: Context): Promise<AuthUser | null> {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  try {
    return await supabaseService.getUserFromToken(token);
  } catch (error) {
    if (error instanceof AuthUnavailableError) throw error;
    return null;
  }
}

export type AppEnv = { Variables: { user: AuthUser } };

/**
 * Rejects the request before any handler reads the body. Every /v1 route sits
 * behind this, so no endpoint can be reached without a valid token.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  let user: AuthUser | null;
  try {
    user = await getAuthUser(c);
  } catch (error) {
    if (!(error instanceof AuthUnavailableError)) throw error;
    return c.json({
      success: false,
      error: "Could not check your sign-in. Try again in a moment.",
    }, 503);
  }
  if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
};

/** The caller that requireUser resolved. Only valid behind that middleware. */
export function currentUser(c: Context): AuthUser {
  const user = c.get("user") as AuthUser | undefined;
  if (!user) throw new Error("currentUser called on a route without requireUser");
  return user;
}
