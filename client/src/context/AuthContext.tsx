import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { saveOnboardingCompleted, saveUserName } from '../utils/localStorage';

export interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password?: string }) => Promise<void>;
  register: (credentials: { name: string; email: string; password?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_USER_KEY = 'kafx_auth_user';
const AUTH_TOKEN_KEY = 'kafx_auth_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      const storedUser = localStorage.getItem(AUTH_USER_KEY);

      if (storedToken && storedUser) {
        const parsedUser = JSON.parse(storedUser) as User;
        setUser(parsedUser);
        setToken(storedToken);
      }
    } catch {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async ({ email }: { email: string; password?: string }) => {
    const derivedName = email.split('@')[0] || 'Operator';
    const formattedName = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);
    const mockUser: User = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      name: formattedName,
      email,
    };
    const mockToken = 'tok_' + Math.random().toString(36).substring(2, 15);

    setUser(mockUser);
    setToken(mockToken);

    localStorage.setItem(AUTH_TOKEN_KEY, mockToken);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(mockUser));
    saveUserName(mockUser.name);
    saveOnboardingCompleted(true);
  };

  const register = async ({ name, email }: { name: string; email: string; password?: string }) => {
    const cleanName = name.trim() || email.split('@')[0] || 'Operator';
    const mockUser: User = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      name: cleanName,
      email,
    };
    const mockToken = 'tok_' + Math.random().toString(36).substring(2, 15);

    setUser(mockUser);
    setToken(mockToken);

    localStorage.setItem(AUTH_TOKEN_KEY, mockToken);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(mockUser));
    saveUserName(mockUser.name);
    saveOnboardingCompleted(true);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
