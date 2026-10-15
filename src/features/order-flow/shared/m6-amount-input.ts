export interface WholeVndInputBounds {
  min: number;
  max: number;
}

/**
 * Strict whole-VND user-text parser for amount inputs. Accepts plain digits
 * (`120000`) or well-formed Vietnamese thousand groups (`120.000`,
 * `1.250.000`), with optional surrounding whitespace and one optional
 * trailing currency mark (`₫`/`đ`). Anything else — decimals (`10000.5`,
 * `10.000.5`), malformed grouping (`1.00.000`), signs, letters, blanks —
 * is rejected as null instead of being silently reshaped into another
 * amount. Bounds are the existing controller contracts; zero is a valid
 * whole amount when the bounds allow it.
 */
export function parseWholeVndInput(text: string, bounds: WholeVndInputBounds): number | null {
  const core = text.trim().replace(/\s*[₫đ]\s*$/, '').trim();
  if (!core) return null;
  const plain = /^\d+$/.test(core);
  const grouped = /^\d{1,3}(?:\.\d{3})+$/.test(core);
  if (!plain && !grouped) return null;
  const digits = core.replace(/\./g, '');
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value < bounds.min || value > bounds.max) return null;
  return value;
}
