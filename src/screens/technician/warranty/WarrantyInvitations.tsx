import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { TechnicianWarrantyClaim } from '../../../api/technician-warranty.api';
import { useWarrantyClaims } from '../../../hooks/useWarrantyClaims';
import { useBadgeStore } from '../../../store/badge.store';
import { lightTheme as colors } from '../../../constants/theme';
import { vnDateString } from '../../../utils/vn-time';
import PillText from '../../../components/PillText';

/** A warranty claim waiting for the technician: what, for whom, where, and the two answers. Both open the claim, which asks to confirm. */
export function WarrantyInvitationCard({ claim, onOpen }: { claim: TechnicianWarrantyClaim; onOpen: () => void }) {
  return <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Xem chi tiết bảo hành #${claim.order.code}`} onPress={onOpen} style={styles.card} testID={`warranty-invitation-${claim.id}`}>
    <View style={styles.top}>
      <Text style={styles.code}>#{claim.order.code}</Text>
      <View style={styles.pill}><PillText style={styles.pillText}>Chờ bạn nhận</PillText></View>
      <Text style={styles.date}>{vnDateString(claim.submittedAt)}</Text>
    </View>
    <Text style={styles.title}>{claim.order.serviceName || 'Bảo hành dịch vụ'}</Text>
    <View style={styles.line}><Ionicons name="person-outline" size={15} color={colors.textSecondary} /><Text style={styles.text}>{claim.order.customerName}</Text></View>
    <View style={styles.line}><Ionicons name="location-outline" size={15} color={colors.textSecondary} /><Text style={styles.muted}>{claim.order.addressSummary}</Text></View>
    <Text style={styles.said} numberOfLines={2}>{claim.description}</Text>
    <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Không nhận được bảo hành #${claim.order.code}`} onPress={onOpen} style={[styles.button, styles.secondary]}><Text style={styles.secondaryText}>Không nhận được</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Nhận yêu cầu bảo hành #${claim.order.code}`} onPress={onOpen} style={[styles.button, styles.primary]}><Text style={styles.primaryText}>Nhận yêu cầu</Text></TouchableOpacity>
    </View>
  </TouchableOpacity>;
}

/** The "Lời mời bảo hành" part of the Invitations tab. Nothing is drawn while there is no claim to take. */
export function WarrantyInvitations() {
  const navigation = useNavigation<any>();
  const { items, total, loading } = useWarrantyClaims('submitted');
  const setWarranty = useBadgeStore((state) => state.setPendingWarranty);
  useEffect(() => { if (!loading) setWarranty(total); }, [loading, total, setWarranty]);
  if (loading || !items.length) return null;
  return <View style={styles.section} accessibilityLabel="Lời mời bảo hành">
    <Text accessibilityRole="header" style={styles.heading}>Lời mời bảo hành ({total})</Text>
    {items.map(claim => <WarrantyInvitationCard key={claim.id} claim={claim} onOpen={() => navigation.navigate('TechnicianWarrantyTask', { claimId: claim.id })} />)}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12, marginBottom: 8 },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.tone.warning.fg, padding: 16, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  code: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.textSecondary },
  pill: { backgroundColor: colors.tone.warning.bg, borderRadius: 8, paddingHorizontal: 8, minHeight: 24, justifyContent: 'center' },
  pillText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.tone.warning.text },
  date: { fontSize: 12, color: colors.textSecondary },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.text },
  line: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  text: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  muted: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  said: { fontSize: 14, lineHeight: 20, color: colors.text, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryText: { fontWeight: '700', color: colors.text, fontSize: 14 },
  primary: { backgroundColor: colors.primaryStrong },
  primaryText: { fontWeight: '700', color: '#FFFFFF', fontSize: 14 },
});
