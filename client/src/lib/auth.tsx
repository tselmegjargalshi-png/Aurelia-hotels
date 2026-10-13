import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api.js';
import type { PublicUser } from '../../../shared/types.js';

interface AuthValue {
  user: PublicUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (name: string, email: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
  setUser: (u: PublicUser) => void;
  favorites: Set<number>;
  toggleFavorite: (hotelId: number) => Promise<boolean>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  const loadFavorites = useCallback(async () => {
    try {
      const { ids } = await api.get<{ ids: number[] }>('/api/account/favorite-ids');
      setFavorites(new Set(ids));
    } catch { setFavorites(new Set()); }
  }, []);

  useEffect(() => {
    api.get<{ user: PublicUser | null }>('/api/auth/me')
      .then(({ user: u }) => { setUser(u); if (u) void loadFavorites(); })
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, [loadFavorites]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await api.post<{ user: PublicUser }>('/api/auth/login', { email, password });
    setUser(u); void loadFavorites();
    return u;
  }, [loadFavorites]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { user: u } = await api.post<{ user: PublicUser }>('/api/auth/register', { name, email, password });
    setUser(u); setFavorites(new Set());
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null); setFavorites(new Set());
  }, []);

  /** Returns the new saved state. Throws ApiError(401) when signed out. */
  const toggleFavorite = useCallback(async (hotelId: number) => {
    const saved = favorites.has(hotelId);
    if (saved) await api.del(`/api/account/favorites/${hotelId}`);
    else await api.put(`/api/account/favorites/${hotelId}`);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (saved) next.delete(hotelId); else next.add(hotelId);
      return next;
    });
    return !saved;
  }, [favorites]);

  const value = useMemo(() => ({ user, ready, login, register, logout, setUser, favorites, toggleFavorite }),
    [user, ready, login, register, logout, favorites, toggleFavorite]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
