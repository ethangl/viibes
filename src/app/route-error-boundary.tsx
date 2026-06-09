import { useEffect } from "react";
import { useRouteError } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { AuthPendingState } from "./auth-pending-state";

const RECOVERY_MARK_KEY = "auth-recovery-at";
const RECOVERY_WINDOW_MS = 5000;

/**
 * Auth-shaped errors surface as a ConvexError carrying `{_tag:"Unauthorized"}`
 * (e.g. `requireRoomAuth` when a room query runs during a brief token gap).
 */
function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("Unauthorized");
}

/** True when we auto-recovered very recently — guards against a reload loop. */
function recoveredRecently(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RECOVERY_MARK_KEY) ?? "0");
    return Date.now() - last < RECOVERY_WINDOW_MS;
  } catch {
    return false;
  }
}

function markRecovered() {
  try {
    sessionStorage.setItem(RECOVERY_MARK_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures; worst case we skip the loop guard.
  }
}

/**
 * Router-level safety net. A transient loss of the Convex auth token (sign-out,
 * the guest→account upgrade swap, session expiry) makes mounted authed queries
 * throw `Unauthorized` and would otherwise hit React Router's default crash
 * page. Here we self-heal by reloading `/` — which re-establishes a guest
 * session — unless we just did so (then we show a manual fallback rather than
 * loop). Non-auth errors get a plain reload affordance.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const authError = isAuthError(error);
  const looping = authError && recoveredRecently();

  useEffect(() => {
    if (authError && !looping && typeof window !== "undefined") {
      markRecovered();
      window.location.assign("/");
    }
  }, [authError, looping]);

  if (authError && !looping) {
    return (
      <AuthPendingState
        title="Reconnecting…"
        description="Re-establishing your session."
      />
    );
  }

  return (
    <section className="flex min-h-72 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-black tracking-tight">
          Something went wrong
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The app hit an unexpected error. Reloading usually clears it.
        </p>
      </div>
      <Button onClick={() => window.location.assign("/")}>Reload</Button>
    </section>
  );
}
