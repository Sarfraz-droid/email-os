import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import { loadConfig } from "../config.js";

/**
 * The session cookie. Uses the `__Host-` prefix (which mandates Secure + Path=/
 * + no Domain) whenever the app is served over https.
 */
function isSecure(): boolean {
  return loadConfig().app.baseUrl.startsWith("https://");
}

export function sessionCookieName(): string {
  return isSecure() ? "__Host-emailos_session" : "emailos_session";
}

function baseOptions(): CookieOptions {
  const secure = isSecure();
  return {
    httpOnly: true,
    // In production the frontend (e.g. *.vercel.app) and backend (e.g. *.fly.dev)
    // are different sites, so credentialed cross-site XHR only carries the cookie
    // when it is SameSite=None. `None` mandates Secure, which https already gives
    // us. Locally (http) we stay on Lax.
    sameSite: secure ? "None" : "Lax",
    secure,
    path: "/",
  };
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, sessionCookieName());
}

export function writeSessionCookie(c: Context, token: string, expires: Date): void {
  setCookie(c, sessionCookieName(), token, { ...baseOptions(), expires });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, sessionCookieName(), baseOptions());
}

// --- Short-lived OAuth state cookie (CSRF defence for the login redirect) -----

const STATE_COOKIE = "emailos_oauth_state";

export function writeStateCookie(c: Context, state: string): void {
  setCookie(c, STATE_COOKIE, state, {
    ...baseOptions(),
    maxAge: 600, // 10 minutes
  });
}

export function readStateCookie(c: Context): string | undefined {
  return getCookie(c, STATE_COOKIE);
}

export function clearStateCookie(c: Context): void {
  deleteCookie(c, STATE_COOKIE, baseOptions());
}
