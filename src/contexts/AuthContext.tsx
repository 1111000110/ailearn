import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getUserInfo } from '../api/user';

export interface AuthUser {
  userId: string;
  nickName: string;
  avatar: string;
  gender: string;
  birthDate: number;
  phone?: string;
  email?: string;
  role?: string;
  status?: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  refresh: async () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);

  const hasToken = useMemo(() => !!localStorage.getItem('token'), []);

  const refresh = async () => {
    if (!localStorage.getItem('token')) {
      setUser(null);
      return;
    }
    setLoading(true);
    try {
      const resp = await getUserInfo({ query_user_id: "0", type: 'get_private_info' });
      const u = resp.user_info;
      setUser({
        userId: u.user_base.user_id,
        nickName: u.user_base.nick_name,
        avatar: u.user_base.avatar,
        gender: u.user_base.gender,
        birthDate: u.user_base.birth_date,
        phone: u.user_private.phone,
        email: u.user_private.email,
        role: u.user_private.role,
        status: u.user_private.status,
      });
    } catch {
      // token 失效或请求失败时清理
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasToken) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

