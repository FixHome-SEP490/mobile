import { createContext, type ComponentType } from 'react';

/**
 * What the customer order frame (5-step bar and order summary) is made of. The navigator provides it, so the shared
 * shell does not import the screens that the summary opens (they import the shell).
 */
export interface OrderContextSlotValue {
  Stepper: ComponentType;
  Summary: ComponentType;
}
export const OrderContextSlot = createContext<OrderContextSlotValue | null>(null);

/** Set while a screen is shown inside a sheet over the order: its back button closes the sheet instead of leaving the order. */
export const SheetCloseContext = createContext<(() => void) | null>(null);
