import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { NavigationProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import {
  Bell,
  CalendarCheck,
  ChevronRight,
  Clock4,
  Home,
  Sparkles,
  User,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '../../constants/theme';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import type { CustomerTabParamList, RootStackParamList } from '../../types';

type CustomerTabName = keyof CustomerTabParamList;
type BookingChoice = 'standard' | 'ai';

type AuthenticatedProps = BottomTabBarProps & { mode: 'authenticated' };
type GuestProps = {
  mode: 'guest';
  activeRouteName: CustomerTabName;
  onGuestTabPress: (routeName: CustomerTabName) => void;
  onGuestBookingChoice: (choice: BookingChoice) => void;
};

export type CustomerAnimatedBottomBarProps = AuthenticatedProps | GuestProps;

type RenderedTab = {
  routeName: CustomerTabName;
  label: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  isFocused: boolean;
  icon: React.ReactNode;
  badgeCount?: number;
};

const CUSTOMER_TABS: CustomerTabName[] = [
  'Home',
  'Bookings',
  'Notifications',
  'Profile',
];

const GUEST_LABELS: Record<CustomerTabName, string> = {
  Home: 'Trang chủ',
  Bookings: 'Hoạt động',
  Notifications: 'Thông báo',
  Profile: 'Tài khoản',
};

const GUEST_ICONS: Record<CustomerTabName, typeof Home> = {
  Home,
  Bookings: Clock4,
  Notifications: Bell,
  Profile: User,
};

export default function CustomerAnimatedBottomBar(props: CustomerAnimatedBottomBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, fontSize } = useAppTheme();
  const reduceMotion = useReduceMotion();
  const sheetRef = useRef<BottomSheetModal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [positionsWidth, setPositionsWidth] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const indicatorX = useSharedValue(0);
  const bookingActionScale = useSharedValue(1);
  const snapPoints = useMemo(() => ['42%', '62%'], []);
  const renderBackdrop = useCallback((backdropProps: React.ComponentProps<typeof BottomSheetBackdrop>) => (
    <BottomSheetBackdrop {...backdropProps} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" opacity={0.48} />
  ), []);

  const activeRouteName = props.mode === 'guest'
    ? props.activeRouteName
    : props.state.routes[props.state.index]?.name;
  const activeTabIndex = CUSTOMER_TABS.indexOf(activeRouteName as CustomerTabName);
  const activeColumn = sheetOpen ? 2 : activeTabIndex >= 2 ? activeTabIndex + 1 : Math.max(0, activeTabIndex);
  const slotWidth = positionsWidth / 5;
  const indicatorWidth = slotWidth;
  const indicatorTargetX = activeColumn * slotWidth;
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));
  const bookingActionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bookingActionScale.value }],
  }));

  useEffect(() => {
    indicatorX.value = reduceMotion
      ? withTiming(indicatorTargetX, { duration: 0 })
      : withSpring(indicatorTargetX, { damping: 14, stiffness: 130, mass: 0.8 });
  }, [activeRouteName, indicatorTargetX, indicatorX, reduceMotion]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!sheetOpen) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSheetOpen(false);
      sheetRef.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [sheetOpen]);

  const tabs: RenderedTab[] = props.mode === 'guest'
    ? CUSTOMER_TABS.map((routeName) => {
        const Icon = GUEST_ICONS[routeName];
        const label = GUEST_LABELS[routeName];
        const isFocused = routeName === props.activeRouteName;
        return {
          routeName,
          label,
          accessibilityLabel: routeName === 'Home'
            ? 'Khách: Trang chủ'
            : `Khách: ${label}, cần đăng nhập`,
          accessibilityHint: routeName === 'Home' ? undefined : 'Đăng nhập để mở mục này',
          isFocused,
          icon: <Icon size={25} color={isFocused && !sheetOpen ? colors.surface : colors.textSecondary} />,
        };
      })
    : CUSTOMER_TABS.flatMap((routeName) => {
        const route = props.state.routes.find((candidate) => candidate.name === routeName);
        if (!route) return [];
        const options = props.descriptors[route.key]?.options;
        if (!options) return [];

        const isFocused = props.state.routes[props.state.index]?.key === route.key;
        const label = typeof options.tabBarLabel === 'string'
          ? options.tabBarLabel
          : options.title ?? routeName;
        const badgeCount = typeof options.tabBarBadge === 'number' && options.tabBarBadge > 0
          ? options.tabBarBadge
          : undefined;
        const baseAccessibilityLabel = options.tabBarAccessibilityLabel ?? label;
        const Icon = options.tabBarIcon;

        return [{
          routeName,
          label,
          accessibilityLabel: badgeCount
            ? `${baseAccessibilityLabel}, ${badgeCount} thông báo chưa đọc`
            : baseAccessibilityLabel,
          isFocused,
          icon: Icon?.({
            focused: isFocused,
            color: isFocused && !sheetOpen ? colors.surface : colors.textSecondary,
            size: 25,
          }) ?? null,
          badgeCount,
        }];
      });

  const getTabPressHandler = (tab: RenderedTab) => () => {
    if (props.mode === 'guest') {
      props.onGuestTabPress(tab.routeName);
      return;
    }

    const route = props.state.routes.find((candidate) => candidate.name === tab.routeName);
    if (!route) return;
    const event = props.navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!tab.isFocused && !event.defaultPrevented) {
      props.navigation.navigate(route.name, route.params);
    }
  };

  const openSheet = () => {
    setSheetOpen(true);
    sheetRef.current?.present();
  };

  const pressBookingActionIn = () => {
    void Haptics.selectionAsync();
    if (!reduceMotion) {
      bookingActionScale.value = withSpring(0.94, { damping: 18, stiffness: 260, mass: 0.5 });
    }
  };

  const pressBookingActionOut = () => {
    bookingActionScale.value = reduceMotion
      ? 1
      : withSpring(1, { damping: 18, stiffness: 260, mass: 0.5 });
  };

  const dismissSheet = () => {
    setSheetOpen(false);
    sheetRef.current?.dismiss();
  };

  const chooseBookingFlow = (choice: BookingChoice) => {
    dismissSheet();
    if (props.mode === 'guest') {
      props.onGuestBookingChoice(choice);
      return;
    }

    const rootNavigation = props.navigation.getParent<NavigationProp<RootStackParamList>>();
    if (choice === 'standard') {
      rootNavigation?.navigate('CustomerServices');
    } else {
      rootNavigation?.navigate('CustomerAIDiagnosis');
    }
  };

  if (keyboardVisible) return null;

  const styles = createStyles(colors, fontSize, insets.bottom);

  return (
    <View style={styles.container} testID="customer-animated-bottom-bar">
      <BlurView intensity={70} tint="light"
        accessibilityRole="tablist"
        style={styles.positions}
        testID="customer-bottom-bar-positions"
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setPositionsWidth((current) => current === width ? current : width);
        }}
      >
        <Animated.View
          testID="customer-tab-indicator"
          style={[
            styles.indicator,
            { width: indicatorWidth },
            indicatorStyle,
          ]}
        >
          <LinearGradient colors={['#60A5FA', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.indicatorSurface} />
        </Animated.View>

        {tabs.slice(0, 2).map((tab) => (
          <Pressable
            key={tab.routeName}
            accessible
            accessibilityRole="tab"
            accessibilityLabel={tab.accessibilityLabel}
            accessibilityHint={tab.accessibilityHint}
            accessibilityState={{ selected: tab.isFocused }}
            onPress={getTabPressHandler(tab)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <View style={styles.iconSlot}>
              {tab.icon}
              {tab.badgeCount ? (
                <View accessible={false} style={styles.badge}>
                  <Text allowFontScaling={false} style={styles.badgeText}>
                    {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}

        <View style={styles.centerSlot} />

        {tabs.slice(2).map((tab) => (
          <Pressable
            key={tab.routeName}
            accessible
            accessibilityRole="tab"
            accessibilityLabel={tab.accessibilityLabel}
            accessibilityHint={tab.accessibilityHint}
            accessibilityState={{ selected: tab.isFocused }}
            onPress={getTabPressHandler(tab)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <View style={styles.iconSlot}>
              {tab.icon}
              {tab.badgeCount ? (
                <View accessible={false} style={[styles.badge, { backgroundColor: colors.error }]}>
                  <Text allowFontScaling={false} style={styles.badgeText}>
                    {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}
      </BlurView>

      <View testID="customer-booking-action-layer" pointerEvents="box-none" style={styles.centerActionLayer}>
        <Animated.View pointerEvents="box-none" style={[styles.actionScale, bookingActionStyle]}>
          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Đặt lịch"
            accessibilityHint="Mở hai cách đặt lịch"
            accessibilityState={{ expanded: sheetOpen }}
            onPress={openSheet}
            onPressIn={pressBookingActionIn}
            onPressOut={pressBookingActionOut}
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          >
            <LinearGradient colors={['#60A5FA', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionSurface}>
              <CalendarCheck size={27} color={colors.surface} strokeWidth={2.2} />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>

      <BottomSheetModal
        accessible={false}
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        onDismiss={() => setSheetOpen(false)}
      >
        <BottomSheetView style={styles.sheetContent}>
          <View style={styles.sheetHeading}>
            <View style={styles.sheetHeadingCopy}>
              <Text style={styles.sheetEyebrow}>ĐẶT LỊCH</Text>
              <Text accessibilityRole="header" style={styles.sheetTitle}>Chọn cách đặt lịch</Text>
            </View>
            <Pressable
              accessible
              accessibilityRole="button"
              accessibilityLabel="Đóng lựa chọn đặt lịch"
              hitSlop={8}
              onPress={dismissSheet}
              style={styles.closeButton}
            >
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Đặt lịch thông thường"
            accessibilityHint={props.mode === 'guest'
              ? 'Đăng nhập để tiếp tục đặt lịch'
              : 'Chọn một dịch vụ trước khi tạo yêu cầu đặt lịch'}
            onPress={() => chooseBookingFlow('standard')}
            style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
          >
            <View style={[styles.choiceIcon, { backgroundColor: colors.primaryTint }]}>
              <CalendarCheck size={22} color={colors.primaryStrong} />
            </View>
            <View style={styles.choiceCopy}>
              <Text style={styles.choiceTitle}>Đặt lịch thông thường</Text>
              <Text style={styles.choiceDescription}>Chọn dịch vụ từ danh mục hiện có.</Text>
            </View>
            <ChevronRight size={19} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="AI hỗ trợ đặt lịch"
            accessibilityHint={props.mode === 'guest'
              ? 'Đăng nhập để tiếp tục với gợi ý AI'
              : 'Mở chẩn đoán tham khảo; bạn xem lại trước khi đặt'}
            onPress={() => chooseBookingFlow('ai')}
            style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
          >
            <View style={[styles.choiceIcon, { backgroundColor: colors.primaryTint }]}>
              <Sparkles size={22} color={colors.primaryStrong} />
            </View>
            <View style={styles.choiceCopy}>
              <Text style={styles.choiceTitle}>AI hỗ trợ đặt lịch</Text>
              <Text style={styles.choiceDescription}>Nhận gợi ý tham khảo, bạn quyết định.</Text>
            </View>
            <ChevronRight size={19} color={colors.textSecondary} />
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  fontSize: ReturnType<typeof useAppTheme>['fontSize'],
  bottomInset: number,
) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'transparent',
      paddingTop: 8,
      paddingBottom: Math.max(bottomInset, 16),
      paddingHorizontal: 16,
    },
    positions: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 64,
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 32,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.4)',
      backgroundColor: 'rgba(255,255,255,0.15)',
      shadowColor: colors.primaryStrong,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 20,
      elevation: 8,
    },
    indicator: {
      position: 'absolute',
      pointerEvents: 'none',
      top: 0,
      bottom: 0,
      left: 0,
      borderRadius: 32,
      padding: 6,
    },
    indicatorSurface: {
      flex: 1,
      width: '100%',
      borderRadius: 26,
      shadowColor: colors.primaryStrong,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    tab: {
      flex: 1,
      minWidth: 0,
      minHeight: 64,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      zIndex: 1,
    },
    tabPressed: {
      opacity: 0.7,
    },
    iconSlot: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: -3,
      right: -5,
      minWidth: 17,
      height: 17,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.surface,
      paddingHorizontal: 3,
      backgroundColor: colors.error,
    },
    badgeText: {
      color: colors.surface,
      fontSize: fontSize.xs,
      fontWeight: '700',
      lineHeight: 14,
    },
    centerSlot: {
      flex: 1,
      minWidth: 0,
      minHeight: 64,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    centerActionLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 10,
    },
    actionScale: {
      width: 56,
      height: 56,
      borderRadius: 28,
    },
    actionButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primaryStrong,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.28,
      shadowRadius: 8,
      elevation: 7,
    },
    actionPressed: {
      opacity: 0.9,
    },
    actionSurface: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetBackground: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    sheetHandle: {
      backgroundColor: colors.border,
      width: 40,
    },
    sheetContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: Math.max(bottomInset, 20),
      gap: 12,
    },
    sheetHeading: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    sheetHeadingCopy: {
      flex: 1,
    },
    sheetEyebrow: {
      color: colors.primaryStrong,
      fontSize: fontSize.xs,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    sheetTitle: {
      color: colors.text,
      fontSize: fontSize.xl,
      fontWeight: '700',
      lineHeight: 28,
      marginTop: 2,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      marginLeft: 12,
    },
    choice: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    choicePressed: {
      opacity: 0.72,
    },
    choiceIcon: {
      width: 44,
      height: 44,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    choiceCopy: {
      flex: 1,
      minWidth: 0,
      paddingRight: 8,
    },
    choiceTitle: {
      color: colors.text,
      fontSize: fontSize.sm,
      fontWeight: '600',
      lineHeight: 20,
    },
    choiceDescription: {
      color: colors.textSecondary,
      fontSize: fontSize.xs,
      lineHeight: 16,
      marginTop: 2,
    },
  });
}
