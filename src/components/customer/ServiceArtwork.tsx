import React from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getServicePresentation } from '../../constants/service-presentation';
import { CUSTOMER_UI_ARTWORK } from '../../constants/customer-artwork';
import { useAppTheme } from '../../constants/theme';

interface ServiceArtworkProps {
  code: string;
  name: string;
  size?: number;
  testID?: string;
}

const ARTWORK_RADIUS = 14;
const DEFAULT_SIZE = 64;

// Home keeps the owner's category motifs where appropriate. Plumbing uses the
// distinct catalog cutouts instead of the shared sink motif's white backplate.
const TRANSPARENT_CUTOUTS: Record<string, ImageSourcePropType> = {
  VE_SINH_DIEU_HOA_1HP: CUSTOMER_UI_ARTWORK.aircon,
  THAY_CONG_TAC_DIEN: CUSTOMER_UI_ARTWORK.electrical,
  SUA_MAY_GIAT: CUSTOMER_UI_ARTWORK.washingMachine,
};

/**
 * Reusable Home/Guest quick-service artwork. All owner assets have real alpha
 * and render contained without adding frames or cropping their subject.
 * Decorative inside the parent service button, which already carries the
 * service name as its accessibility label.
 */
export default function ServiceArtwork({ code, name, size = DEFAULT_SIZE, testID }: ServiceArtworkProps) {
  const { colors } = useAppTheme();
  const presentation = getServicePresentation(code);
  const cutoutSource = TRANSPARENT_CUTOUTS[code];
  const dimension = Number.isFinite(size) && (size as number) > 0 ? (size as number) : DEFAULT_SIZE;
  const resolvedTestID = testID ?? `service-artwork-${code}`;
  void name;

  if (!presentation) {
    return (
      <View
        style={[
          styles.fallback,
          {
            width: dimension,
            height: dimension,
            borderRadius: ARTWORK_RADIUS,
            backgroundColor: colors.divider,
            marginBottom: 8,
          },
        ]}
        testID={`${resolvedTestID}-fallback`}
        accessible={false}
      >
        <Ionicons
          name="construct-outline"
          size={24}
          color={colors.textSecondary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
    );
  }

  return (
    <Image
      source={cutoutSource ?? presentation.imageSource}
      style={{ width: dimension, height: dimension, marginBottom: 8 }}
      resizeMode="contain"
      accessible={false}
      testID={resolvedTestID}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
