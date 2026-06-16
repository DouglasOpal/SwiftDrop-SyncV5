// src/context/AuthContext.js — global session: restore, login, logout
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';
import { setAccountType, setLogoutHandler } from '../services/api';
import { saveTokens, saveSession, getSession, clearAll } from '../utils/storage';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [account, setAccount] = useState(null);   // { type, profile }

  const logout = useCallback(async () => {
    try {
      if (account?.type === 'user')  await authService.userLogout();
      if (account?.type === 'rider') await authService.riderLogout();
    } catch {}
    await clearAll();
    setAccount(null);
    setAccountType('user');
  }, [account]);

  // Allow the api layer to force-logout on irrecoverable 401s
  useEffect(() => { setLogoutHandler(() => { clearAll(); setAccount(null); }); }, []);

  // Restore session on launch
  useEffect(() => {
    (async () => {
      try {
        const s = await getSession();
        if (s?.type) {
          setAccountType(s.type);
          setAccount(s);
          // best-effort refresh of profile
          try {
            if (s.type === 'user')  { const { data } = await authService.userMe();  persist('user',  data.user); }
            if (s.type === 'rider') { const { data } = await authService.riderMe(); persist('rider', data.rider); }
          } catch {}
        }
      } finally { setBooting(false); }
    })();
  }, []);

  const persist = useCallback(async (type, profile, tokens) => {
    setAccountType(type);
    if (tokens) await saveTokens(tokens.accessToken, tokens.refreshToken);
    const next = { type, profile };
    setAccount(next);
    await saveSession(next);
    return next;
  }, []);

  const loginUser = useCallback(async (profile, tokens) => persist('user', profile, tokens), [persist]);
  const loginRider = useCallback(async (profile, tokens) => persist('rider', profile, tokens), [persist]);
  const loginAdmin = useCallback(async (profile, tokens) => persist('admin', profile, tokens), [persist]);

  const updateProfile = useCallback(async (profile) => {
    const next = { ...account, profile };
    setAccount(next);
    await saveSession(next);
  }, [account]);

  return (
    <AuthContext.Provider value={{
      booting, account,
      type: account?.type || null,
      profile: account?.profile || null,
      loginUser, loginRider, loginAdmin, updateProfile, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
