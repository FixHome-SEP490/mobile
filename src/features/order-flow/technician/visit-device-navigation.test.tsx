import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import { NavigationContainer, useNavigation, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Same shape as the app: a root route keyed by serviceOrderId that hosts a nested stack, whose screen switches device.
const Root = createNativeStackNavigator();
const Inner = createNativeStackNavigator();
const mounts: string[] = [];

function Task() {
  const nav = useNavigation<any>();
  const id = (useRoute<any>().params?.serviceOrderId ?? '') as string;
  return (
    <TouchableOpacity testID="to-device-2" onPress={() => nav.navigate('TechnicianOrderDetail', { serviceOrderId: 'order-2' })}>
      <Text>{`order ${id}`}</Text>
    </TouchableOpacity>
  );
}
function Detail() {
  const id = (useRoute<any>().params?.serviceOrderId ?? '') as string;
  React.useEffect(() => { mounts.push(id); }, [id]);
  return (
    <React.Fragment key={id}>
      <Inner.Navigator screenOptions={{ headerShown: false }}>
        <Inner.Screen name="OrderTask" component={Task} initialParams={{ serviceOrderId: id }} />
      </Inner.Navigator>
    </React.Fragment>
  );
}

it('moving to another device of the visit opens that order from the nested order screen', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <NavigationContainer>
        <Root.Navigator screenOptions={{ headerShown: false }}>
          <Root.Screen name="TechnicianOrderDetail" component={Detail} initialParams={{ serviceOrderId: 'order-1' }} />
        </Root.Navigator>
      </NavigationContainer>,
    );
  });
  const text = () => tree.root.findAllByType(Text).map((n) => n.props.children).join('|');
  expect(text()).toContain('order order-1');
  await act(async () => { tree.root.findByProps({ testID: 'to-device-2' }).props.onPress(); });
  expect(text()).toContain('order order-2');
  expect(mounts).toEqual(['order-1', 'order-2']);
});
