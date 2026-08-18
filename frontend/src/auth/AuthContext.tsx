import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, setAccessToken } from '../api/client';
import type { User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
  ) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<User>('/api/v1/auth/me');
      setUser(res.data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<User>('/api/v1/auth/me');
        setUser(res.data);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ user: User; accessToken: string; accessTokenExpiresAt: string }>(
      '/api/v1/auth/login',
      { email, password },
    );
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await api.post<User>('/api/v1/auth/register', {
        name,
        email,
        password,
      });
      return res.data;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post<{ data: null }>('/api/v1/auth/logout');
    } catch {
      // ignore — the local session is cleared regardless
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
