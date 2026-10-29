import { createContext, useContext } from 'react';

/** Route name of the tab that holds one device's order inside the technician's order screen. */
export const visitDeviceTabName = (serviceOrderId: string) => `device-${serviceOrderId}`;

/** The panel tells the order screen which orders belong to the same visit, so each gets its own tab. */
export const VisitDevicesContext = createContext<(serviceOrderIds: string[]) => void>(() => undefined);
export const useRegisterVisitDevices = () => useContext(VisitDevicesContext);

// The device the technician was last on, per visit. Leaving the order screen (Home) drops its tabs, so the list reopens this one.
// ponytail: in memory only, forgotten when the app restarts.
const lastDevice = new Map<string, string>();
export const rememberVisitDevice = (visitGroupId: string, serviceOrderId: string) => { lastDevice.set(visitGroupId, serviceOrderId); };
export const rememberedVisitDevice = (visitGroupId: string) => lastDevice.get(visitGroupId);
