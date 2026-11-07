import { create } from 'zustand';

// Tab-bar badge counts shared between the tab bar and the screens that change them
// (read a notification, answer an invitation) so the badge updates without a refocus.
interface BadgeState {
  unreadNotifications: number;
  pendingInvitations: number;
  /** Warranty claims waiting for the technician to take them: they are invitations too. */
  pendingWarranty: number;
  setUnreadNotifications: (count: number) => void;
  setPendingInvitations: (count: number) => void;
  setPendingWarranty: (count: number) => void;
}

export const useBadgeStore = create<BadgeState>((set) => ({
  unreadNotifications: 0,
  pendingInvitations: 0,
  pendingWarranty: 0,
  setUnreadNotifications: (count) => set({ unreadNotifications: Math.max(0, count) }),
  setPendingInvitations: (count) => set({ pendingInvitations: Math.max(0, count) }),
  setPendingWarranty: (count) => set({ pendingWarranty: Math.max(0, count) }),
}));
