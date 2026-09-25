// src/store/auth.store.ts
import { create } from 'zustand';
import type { UserInfo } from '../types';

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionGeneration: number;

  // Actions
  beginSessionTransition: () => void;
  setAuth: (token: string, user: UserInfo) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true, // Start as loading to check stored token
  sessionGeneration: 0,

  beginSessionTransition: () =>
    set((state) => ({
      sessionGeneration: state.sessionGeneration + 1,
    })),

  setAuth: (token: string, user: UserInfo) =>
    set((state) => ({
      token,
      user,
      isAuthenticated: true,
      isLoading: false,
      sessionGeneration:
        state.isAuthenticated && state.user?.id === user.id
          ? state.sessionGeneration
          : state.sessionGeneration + 1,
    })),

  logout: () =>
    set((state) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      sessionGeneration: state.sessionGeneration + 1,
    })),

  setLoading: (isLoading: boolean) => set({ isLoading }),
}));