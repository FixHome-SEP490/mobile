import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../constants/theme';

export default function TechnicianNotificationsScreen() {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Thông báo</Text>
      </View>
      <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.list}>
          <TouchableOpacity style={styles.card}>
            <View style={styles.iconContainer}>
              <Ionicons name="location-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.title}>Công việc mới gần bạn</Text>
              <Text style={styles.desc}>Điều hòa không lạnh · 2.1 km · phản hồi trong 45s</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card}>
            <View style={styles.iconContainerActive}>
              <Ionicons name="checkmark-circle-outline" size={24} color="#16A34A" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.title}>Khách hàng đã duyệt báo giá</Text>
              <Text style={styles.desc}>#QT-8821 · +250.000đ</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card}>
            <View style={styles.iconContainer}>
              <Ionicons name="cash-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.title}>Thu nhập đã ghi nhận</Text>
              <Text style={styles.desc}>+280.000đ từ #FH-240921</Text>
            </View>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  scrollContent: {
    padding: 16,
  },
  list: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconContainerActive: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  desc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
});
