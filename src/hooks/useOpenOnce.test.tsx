import React from 'react';
import { act, create } from 'react-test-renderer';
import { useOpenOnce } from './useOpenOnce';

let mockFocus: (() => void) | undefined;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => { mockFocus = effect; },
}));

const holder: { guard?: (open: () => void) => void } = {};
function Probe() {
  const guard = useOpenOnce();
  React.useEffect(() => { holder.guard = guard; });
  return null;
}
const guard = (open: () => void) => holder.guard!(open);

it('opens once for a double tap and again after the screen is focused anew', async () => {
  await act(async () => { create(<Probe />); });
  const open = jest.fn();
  act(() => { guard(open); guard(open); guard(open); });
  expect(open).toHaveBeenCalledTimes(1);
  act(() => { mockFocus?.(); });
  act(() => { guard(open); guard(open); });
  expect(open).toHaveBeenCalledTimes(2);
});
