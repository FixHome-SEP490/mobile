import { StatusBar } from 'react-native';
import { homeStatusBar } from './home-status-bar';


it('Home sets light status bar icons only while it is in front, and gives them back when another screen opens (M-28)', () => {
  const entry = { barStyle: 'light-content' };
  const push = jest.spyOn(StatusBar, 'pushStackEntry').mockReturnValue(entry as never);
  const pop = jest.spyOn(StatusBar, 'popStackEntry').mockImplementation(() => undefined);
  const undo = homeStatusBar();
  expect(push).toHaveBeenCalledWith({ barStyle: 'light-content' });
  expect(pop).not.toHaveBeenCalled();
  undo();
  expect(pop).toHaveBeenCalledWith(entry);
  push.mockRestore(); pop.mockRestore();
});

it('Home does not crash on the web build, where react-native-web has no status bar stack (14/11)', () => {
  const original = StatusBar.pushStackEntry;
  (StatusBar as unknown as { pushStackEntry: unknown }).pushStackEntry = undefined;
  try {
    const undo = homeStatusBar();
    expect(() => undo()).not.toThrow();
  } finally {
    (StatusBar as unknown as { pushStackEntry: unknown }).pushStackEntry = original;
  }
});
