import type { Context } from "hono";
import { supabaseService } from "./supabaseClient.ts";

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
 */
export async function getAuthUser(c: Context): Promise<AuthUser | null> {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  try {
    return await supabaseService.getUserFromToken(token);
  } catch {
    return null;
  }
}
