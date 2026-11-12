import React from 'react';
import { Text, type TextProps } from 'react-native';

/**
 * Text for pills, badges, chips and tags: same props and look as Text, laid out on one line.
 *
 * On Android (seen on API 35 with the system font) a text whose width comes from its own content, such as a
 * status pill, is sometimes laid out a fraction of a pixel narrower than it measured. Android then moves the
 * last word to a second line the view has no height for, so "Đã duyệt" showed as "Đã", "Đã hủy" as "Đã" and
 * "Tổng thu: 535.000 ₫" lost its amount. Which strings hit it depends on font, size and weight (checked on the
 * FixHome_Dev emulator: "Đã duyệt" at weight 600 is cut, at 400 and 700 it is not). A one-line text has no
 * second line to lose: the full label shows. A caller that really needs wrapping passes `numberOfLines` itself.
 */
export default function PillText({ numberOfLines = 1, ...props }: TextProps) {
  return <Text numberOfLines={numberOfLines} {...props} />;
}
