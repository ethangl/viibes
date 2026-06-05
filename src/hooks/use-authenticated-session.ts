import { useAppAuth } from "../app/app-runtime";

export function useAuthenticatedSession() {
  const { session } = useAppAuth();

  if (!session) {
    throw new Error(
      "useAuthenticatedSession must be used within RequireAuthenticatedSession.",
    );
  }

  return session;
}
