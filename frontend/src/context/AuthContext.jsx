import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  attachSession as apiAttachSession,
  getMe,
  googleAuthApi,
  loginUser,
  logoutApi,
  registerUser,
  setStoredToken,
  getStoredToken,
} from "../services/api.js";
import { getSessionId } from "../utils/sessionId.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getStoredToken()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const linkAnonymousSession = useCallback(async () => {
    try {
      await apiAttachSession(getSessionId());
    } catch {
      /* non-fatal */
    }
  }, []);

  const signIn = useCallback(
    async (email, password) => {
      const data = await loginUser({ email, password });
      setStoredToken(data.access_token);
      setUser(data.user);
      await linkAnonymousSession();
    },
    [linkAnonymousSession]
  );

  const signUp = useCallback(
    async (body) => {
      const data = await registerUser(body);
      setStoredToken(data.access_token);
      setUser(data.user);
      await linkAnonymousSession();
    },
    [linkAnonymousSession]
  );

  const signInWithGoogle = useCallback(
    async (idToken) => {
      const data = await googleAuthApi(idToken, getSessionId());
      setStoredToken(data.access_token);
      setUser(data.user);
      // Session is already linked server-side in the /auth/google endpoint
    },
    []
  );

  const signOut = useCallback(async () => {
    await logoutApi();
    setStoredToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      signIn,
      signUp,
      signOut,
      signInWithGoogle,
      refresh,
    }),
    [user, ready, signIn, signUp, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
