import React, { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  createNavigatorFactory,
  TabRouter,
  useNavigationBuilder,
  type DefaultNavigatorOptions,
  type ParamListBase,
  type TabActionHelpers,
  type TabNavigationState,
  type TabRouterOptions,
} from '@react-navigation/native';

type Options = { sceneStyle?: StyleProp<ViewStyle> };
type Props = DefaultNavigatorOptions<ParamListBase, string | undefined, TabNavigationState<ParamListBase>, Options, Record<string, never>, unknown> & TabRouterOptions;

/**
 * Tabs with no tab bar, drawn with plain Views. `@react-navigation/bottom-tabs` always renders react-native-screens'
 * ScreenContainer, which an iOS build without that native view (Expo Go) shows as "Unimplemented component".
 * A tab mounts when first opened and then stays mounted, hidden, so the order left behind keeps its state.
 */
function PlainTabsView({ children, screenOptions, id, ...rest }: Props) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder<TabNavigationState<ParamListBase>, TabRouterOptions, TabActionHelpers<ParamListBase>, Options, Record<string, never>>(
    TabRouter,
    { children, screenOptions, id, ...rest },
  );
  const [opened, setOpened] = useState<string[]>([]);
  const current = state.routes[state.index].key;
  // Adjusting state while rendering is React's way to derive it from props: it re-renders at once.
  if (!opened.includes(current)) setOpened([...opened, current]);
  return (
    <NavigationContent>
      <View style={styles.fill}>
        {state.routes.map((route, index) => {
          if (!opened.includes(route.key) && route.key !== current) return null;
          const { sceneStyle } = descriptors[route.key].options;
          return (
            <View key={route.key} style={[styles.fill, sceneStyle, index === state.index ? null : styles.hidden]} pointerEvents={index === state.index ? 'auto' : 'none'}>
              {descriptors[route.key].render()}
            </View>
          );
        })}
      </View>
    </NavigationContent>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 }, hidden: { display: 'none' } });

export const createPlainTabs = createNavigatorFactory(PlainTabsView);
