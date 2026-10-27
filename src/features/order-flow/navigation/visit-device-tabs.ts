import { createContext, useContext } from 'react';

/** Route name of the tab that holds one device's order inside the technician's order screen. */
export const visitDeviceTabName = (serviceOrderId: string) => `device-${serviceOrderId}`;

/** The panel tells the order screen which orders belong to the same visit, so each gets its own tab. */
export const VisitDevicesContext = createContext<(serviceOrderIds: string[]) => void>(() => undefined);
export const useRegisterVisitDevices = () => useContext(VisitDevicesContext);
