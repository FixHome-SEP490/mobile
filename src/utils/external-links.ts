import { Alert, Linking } from 'react-native';

/** `tel:` link for a Vietnamese phone number typed with spaces/dots/dashes; null when nothing dialable. */
export function telUrl(phone?: string | null): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return /^\+?\d{8,15}$/.test(digits) ? `tel:${digits}` : null;
}

/** Universal Google Maps search link (opens the Maps app when installed, the browser otherwise). */
export function mapsUrl(address?: string | null): string | null {
  const q = (address ?? '').trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** Open a link outside the app; never throws, tells the user when the device cannot. */
export async function openExternal(url: string | null, failTitle: string, failMessage: string): Promise<void> {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(failTitle, failMessage);
  }
}
