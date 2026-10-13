import type { RootStackParamList } from '../types';

export function appEntryRoute(authenticated: boolean, role: string | null, seen: boolean, generation: number): keyof RootStackParamList {
  if (authenticated && role === 'customer') return 'CustomerMain';
  if (authenticated && role === 'technician') return 'TechnicianMain';
  return seen || generation > 0 ? 'CustomerGuestHome' : 'CustomerRoleChoice';
}
