import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { NavigationContainer, type NavigationContainerRef, type ParamListBase } from '@react-navigation/native';
import { createPlainTabs } from './PlainTabs';

const Tabs = createPlainTabs();
const mounts: string[] = [];
const Screen = (name: string) => function S() { React.useEffect(() => { mounts.push(name); }, []); return <Text>{name}</Text>; };
const A = Screen('a');
const B = Screen('b');

it('opens a tab only when first visited, keeps the one left behind mounted, and needs no ScreenContainer', async () => {
  const ref = React.createRef<NavigationContainerRef<ParamListBase>>();
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <NavigationContainer ref={ref}>
        <Tabs.Navigator>
          <Tabs.Screen name="a" component={A} />
          <Tabs.Screen name="b" component={B} />
        </Tabs.Navigator>
      </NavigationContainer>,
    );
  });
  expect(mounts).toEqual(['a']);
  await act(async () => { ref.current?.navigate('b'); });
  expect(mounts).toEqual(['a', 'b']);
  expect(tree.root.findAllByType(Text).map((t) => t.props.children)).toEqual(['a', 'b']);
  await act(async () => { ref.current?.navigate('a'); });
  expect(mounts).toEqual(['a', 'b']);
});
