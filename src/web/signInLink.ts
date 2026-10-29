/*
 * The sign-in link in the email leads back to the app with the result in the address, either
 *   #access_token=…&refresh_token=…&type=magiclink   (signed in), or
 *   #error=…&error_code=otp_expired&error_description=…   (the link was too old or already used).
 * This is read once when the app starts, before anything else uses the address, and then removed.
 */

export type LinkResult =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string };

export function readSignInLink(hash: string): LinkResult | null {
  if (!/(access_token|error_description|error_code)=/.test(hash)) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const access = p.get("access_token"), refresh = p.get("refresh_token");
  if (access && refresh) return { kind: "tokens", accessToken: access, refreshToken: refresh };
  const code = p.get("error_code") || "";
  return {
    kind: "error",
    message: /expired/.test(code) || /expired/i.test(p.get("error_description") || "")
      ? "That sign-in link has expired or was already used. Send yourself a new one."
      : "That sign-in link didn’t work: " + (p.get("error_description") || code || "unknown error")
  };
}

let captured: LinkResult | null | undefined;

/** Called once at start-up. */
export function captureSignInLink(): void {
  captured = readSignInLink(location.hash);
  if (captured) history.replaceState(null, "", location.pathname + location.search + "#account");
}

/** The link result from start-up, handed out once. */
export function takeSignInLink(): LinkResult | null {
  const c = captured ?? null;
  captured = null;
  return c;
}

/** What to do after the link brings someone back: kept on the phone while they’re in their email. */
const PENDING = "idkdates:v1:pendingSignIn";
export interface PendingSignIn { joinCode: string | null; email: string }
export const savePending = (p: PendingSignIn) => { try { localStorage.setItem(PENDING, JSON.stringify(p)); } catch { /* ignore */ } };
export const takePending = (): PendingSignIn | null => {
  try { const raw = localStorage.getItem(PENDING); localStorage.removeItem(PENDING); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
