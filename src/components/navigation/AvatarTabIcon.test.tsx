import React from 'react';
import { Image } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AvatarTabIcon } from './AvatarTabIcon';

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  return { User: (props: Record<string, unknown>) => ReactModule.createElement(Native.View, props) };
});

describe('AvatarTabIcon image lifecycle', () => {
  it('keeps the load callback and source stable, then ignores repeated load events', () => {
    const onRender = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <React.Profiler id="avatar-icon" onRender={onRender}>
          <AvatarTabIcon uri="https://cdn.example.test/avatar.png" size={20} color="#fff" focused={false} />
        </React.Profiler>,
      );
    });

    const firstImage = tree.root.findByType(Image);
    const onLoad = firstImage.props.onLoad as (event: unknown) => void;
    const source = firstImage.props.source;
    onRender.mockClear();

    act(() => onLoad({}));
    const loadedImage = tree.root.findByType(Image);
    expect(loadedImage.props.onLoad).toBe(onLoad);
    expect(loadedImage.props.source).toBe(source);

    onRender.mockClear();
    act(() => onLoad({}));
    expect(onRender).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });

  it('does not dispatch another state update for duplicate image errors', () => {
    const onRender = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <React.Profiler id="avatar-icon-error" onRender={onRender}>
          <AvatarTabIcon uri="https://cdn.example.test/avatar.png" size={20} color="#fff" focused={false} />
        </React.Profiler>,
      );
    });
    const onError = tree.root.findByType(Image).props.onError as (event: unknown) => void;
    act(() => onError({}));
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    onRender.mockClear();
    act(() => onError({}));
    expect(onRender).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
