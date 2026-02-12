import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { supabase } from '../../../lib/supabaseClient';

interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface RoomType {
  id: string;
  name: string;
  base_rate: number;
}

interface Property {
  id: string;
  name: string;
  city: string;
  state: string;
}

interface RefundRequest {
  id: string;
  booking_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'processed' | 'failed';
  amount_requested_to_refund: number;
}

interface Booking {
  id: string;
  guest_id: string;
  property_id: string;
  room_type_id: string;
  check_in_date: string;
  check_in_time: string;
  check_out_date: string;
  check_out_time: string;
  adults: number;
  children: number;
  rooms_booked: number;
  status: 'pending' | 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled';
  booking_status?: string;
  payment_status: 'pending' | 'partial' | 'paid' | 'pay-at-hotel';
  total_amount: number;
  advance_amount?: number;
  special_requests?: string;
  created_at: string;
  guest?: Guest;
  room_type?: RoomType;
  property?: Property;
  refund_request?: RefundRequest;
}

const STATUS_COLORS = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  confirmed: { bg: '#DBEAFE', text: '#1E3A8A' },
  'checked-in': { bg: '#D1FAE5', text: '#065F46' },
  'checked-out': { bg: '#E5E7EB', text: '#374151' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
};

const PAYMENT_STATUS_COLORS = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  partial: { bg: '#DBEAFE', text: '#1E3A8A' },
  paid: { bg: '#D1FAE5', text: '#065F46' },
  'pay-at-hotel': { bg: '#E0E7FF', text: '#3730A3' },
};

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalBookings: 0,
    pendingBookings: 0,
    checkInsToday: 0,
    checkOutsToday: 0,
  });

  useEffect(() => {
    loadBookings();
    loadStats();
  }, [activeTab]);

  useEffect(() => {
    filterBookings();
  }, [bookings, searchTerm, dateRange]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadBookings(), loadStats()]);
    setRefreshing(false);
  }, [activeTab]);

  const filterBookings = () => {
    let filtered = [...bookings];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (booking) =>
          booking.guest?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          booking.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          booking.guest?.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Date range filter
    if (dateRange !== 'all') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      filtered = filtered.filter((booking) => {
        const checkIn = new Date(booking.check_in_date);
        const checkOut = new Date(booking.check_out_date);

        switch (dateRange) {
          case 'today':
            return (
              checkIn.toDateString() === today.toDateString() ||
              checkOut.toDateString() === today.toDateString() ||
              (checkIn <= today && checkOut >= today)
            );
          case 'week':
            const weekFromNow = new Date(today);
            weekFromNow.setDate(weekFromNow.getDate() + 7);
            return checkIn >= today && checkIn <= weekFromNow;
          case 'month':
            const monthFromNow = new Date(today);
            monthFromNow.setMonth(monthFromNow.getMonth() + 1);
            return checkIn >= today && checkIn <= monthFromNow;
          default:
            return true;
        }
      });
    }

    setFilteredBookings(filtered);
  };

  const loadBookings = async () => {
    try {
      setLoading(true);

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('User not authenticated');
      }

      // Get user's room types
      const { data: userRoomTypes, error: roomTypesError } = await supabase
        .from('room_types')
        .select('id, property_id, name, base_rate')
        .in(
          'property_id',
          (
            await supabase.from('hotels').select('id').eq('owner_id', user.id)
          ).data?.map((p) => p.id) || []
        );

      if (roomTypesError || !userRoomTypes || userRoomTypes.length === 0) {
        setBookings([]);
        return;
      }

      const roomTypeIds = userRoomTypes.map((rt) => rt.id);

      // Fetch bookings
      let query = supabase
        .from('bookings')
        .select('*')
        .in('room_type_id', roomTypeIds)
        .order('created_at', { ascending: false });

      if (activeTab !== 'all') {
        query = query.eq('status', activeTab);
      }

      const { data: bookingsData, error: bookingsError } = await query;

      if (bookingsError) throw bookingsError;

      if (bookingsData && bookingsData.length > 0) {
        const bookingIds = bookingsData.map((b) => b.id);
        const guestIds = [...new Set(bookingsData.map((b) => b.guest_id).filter(Boolean))];
        const propertyIds = [...new Set(userRoomTypes.map((rt) => rt.property_id))];

        // Fetch related data
        const [guestsResult, propertiesResult, bookingStatusResult, refundRequestsResult] =
          await Promise.all([
            guestIds.length > 0
              ? supabase.from('guests').select('*').in('id', guestIds)
              : { data: [] },
            propertyIds.length > 0
              ? supabase.from('hotels').select('id, name, city, state').in('id', propertyIds)
              : { data: [] },
            supabase
              .from('booking_status')
              .select('*')
              .in('booking_id', bookingIds)
              .order('created_at', { ascending: false }),
            supabase
              .from('refund_requests')
              .select('id, booking_id, status, amount_requested_to_refund')
              .in('booking_id', bookingIds),
          ]);

        const guestsMap = new Map((guestsResult.data || []).map((g) => [g.id, g]));
        const propertiesMap = new Map((propertiesResult.data || []).map((p) => [p.id, p]));
        const roomTypesMap = new Map(userRoomTypes.map((r) => [r.id, r]));
        const statusMap = new Map((bookingStatusResult.data || []).map((s) => [s.booking_id, s]));
        const refundMap = new Map(
          (refundRequestsResult.data || []).map((r) => [r.booking_id, r])
        );

        const bookingsWithRelations = bookingsData.map((booking) => {
          const roomType = roomTypesMap.get(booking.room_type_id);
          const property = roomType ? propertiesMap.get(roomType.property_id) : null;
          const bookingStatus = statusMap.get(booking.id);
          const refundRequest = refundMap.get(booking.id);
          const currentStatus = bookingStatus?.status || booking.status;

          return {
            ...booking,
            status: currentStatus,
            guest: guestsMap.get(booking.guest_id) || null,
            property: property || null,
            room_type: roomType || null,
            refund_request: refundRequest || null,
          };
        });

        setBookings(bookingsWithRelations);

      } else {
        setBookings([]);
      }
    } catch (error: any) {
      console.error('Error loading bookings:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to load bookings',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return;

      const { data: userRoomTypes } = await supabase
        .from('room_types')
        .select('id')
        .in(
          'property_id',
          (
            await supabase.from('hotels').select('id').eq('owner_id', user.id)
          ).data?.map((p) => p.id) || []
        );

      if (!userRoomTypes || userRoomTypes.length === 0) {
        setStats({
          totalBookings: 0,
          pendingBookings: 0,
          checkInsToday: 0,
          checkOutsToday: 0,
        });
        return;
      }

      const roomTypeIds = userRoomTypes.map((rt) => rt.id);
      const today = new Date().toISOString().split('T')[0];

      const [allBookings, pendingBookings, checkInsToday, checkOutsToday] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact' }).in('room_type_id', roomTypeIds),
        supabase
          .from('bookings')
          .select('id', { count: 'exact' })
          .in('room_type_id', roomTypeIds)
          .eq('status', 'pending'),
        supabase
          .from('bookings')
          .select('id', { count: 'exact' })
          .in('room_type_id', roomTypeIds)
          .eq('check_in_date', today),
        supabase
          .from('bookings')
          .select('id', { count: 'exact' })
          .in('room_type_id', roomTypeIds)
          .eq('check_out_date', today),
      ]);

      setStats({
        totalBookings: allBookings.count || 0,
        pendingBookings: pendingBookings.count || 0,
        checkInsToday: checkInsToday.count || 0,
        checkOutsToday: checkOutsToday.count || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleApproveBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from('booking_status')
        .insert({
          booking_id: bookingId,
          status: 'confirmed',
          changed_by: (await supabase.auth.getUser()).data.user?.id,
          notes: 'Booking approved by owner',
        });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Booking approved successfully',
      });

      loadBookings();
    } catch (error) {
      console.error('Error approving booking:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to approve booking',
      });
    }
  };

  const handleRejectBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from('booking_status')
        .insert({
          booking_id: bookingId,
          status: 'cancelled',
          changed_by: (await supabase.auth.getUser()).data.user?.id,
          notes: 'Booking rejected by owner',
        });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Success',
        text2: 'Booking rejected',
      });

      loadBookings();
    } catch (error) {
      console.error('Error rejecting booking:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to reject booking',
      });
    }
  };

  const renderStatCard = (icon: string, value: number, label: string, color: string) => (
    <View style={styles.statCard}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const renderBookingCard = ({ item }: { item: Booking }) => {
    const statusColor = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    const paymentColor = PAYMENT_STATUS_COLORS[item.payment_status] || PAYMENT_STATUS_COLORS.pending;

    return (
      <TouchableOpacity
        style={styles.bookingCard}
        onPress={() => router.push(`/(tabs)/bookings/${item.id}` as any)}
        activeOpacity={0.7}
      >
        {/* Refund Banner */}
        {item.refund_request && item.refund_request.status === 'pending' && (
          <View style={styles.refundBanner}>
            <Ionicons name="warning" size={16} color="#92400E" />
            <Text style={styles.refundText}>
              Refund Request: ₹{item.refund_request.amount_requested_to_refund.toLocaleString()}
            </Text>
          </View>
        )}

        {/* Booking Header */}
        <View style={styles.bookingHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.guestName}>{item.guest?.name || 'Guest'}</Text>
            <Text style={styles.guestEmail}>{item.guest?.email || ''}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusText, { color: statusColor.text }]}>{item.status}</Text>
          </View>
        </View>

        {/* Booking Details */}
        <View style={styles.bookingDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="business-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>
              {item.property?.name || 'Property'} • {item.room_type?.name || 'Room'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>
              {formatDate(item.check_in_date)} - {formatDate(item.check_out_date)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>
              Check-in: {formatTime(item.check_in_time)} • Check-out: {formatTime(item.check_out_time)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="people-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>
              {item.adults} Adult{item.adults > 1 ? 's' : ''}, {item.children} Child
              {item.children !== 1 ? 'ren' : ''} • {item.rooms_booked} Room
              {item.rooms_booked > 1 ? 's' : ''}
            </Text>
          </View>

          {item.special_requests && (
            <View style={styles.detailRow}>
              <Ionicons name="document-text-outline" size={16} color="#6B7280" />
              <Text style={[styles.detailText, { fontStyle: 'italic' }]} numberOfLines={2}>
                {item.special_requests}
              </Text>
            </View>
          )}
        </View>

        {/* Booking Footer */}
        <View style={styles.bookingFooter}>
          <View>
            <Text style={styles.amountLabel}>Total Amount</Text>
            <Text style={styles.amount}>₹{item.total_amount.toLocaleString()}</Text>
          </View>
          <View style={[styles.paymentBadge, { backgroundColor: paymentColor.bg }]}>
            <Text style={[styles.paymentText, { color: paymentColor.text }]}>
              {item.payment_status}
            </Text>
          </View>
        </View>

        {/* Quick Actions for Pending Bookings */}
        {item.status === 'pending' && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.approveButton}
              onPress={(e) => {
                e.stopPropagation();
                handleApproveBooking(item.id);
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.approveButtonText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={(e) => {
                e.stopPropagation();
                handleRejectBooking(item.id);
              }}
            >
              <Ionicons name="close-circle-outline" size={18} color="#fff" />
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E3A8A" />
        <Text style={styles.loadingText}>Loading bookings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Bookings</Text>
            <Text style={styles.headerSubtitle}>Manage your property bookings</Text>
          </View>
          <View style={styles.addButton}>
            <LinearGradient
              colors={['#1E3A8A', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.addButtonGradient}
            >
              <TouchableOpacity onPress={() => router.push('/(tabs)/bookings/new' as any)}>
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.statsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsContent}
          >
            {renderStatCard('grid-outline', stats.totalBookings, 'Total Bookings', '#1E3A8A')}
            {renderStatCard('time-outline', stats.pendingBookings, 'Pending', '#F59E0B')}
            {renderStatCard('enter-outline', stats.checkInsToday, 'Check-ins Today', '#10B981')}
            {renderStatCard('exit-outline', stats.checkOutsToday, 'Check-outs Today', '#EF4444')}
          </ScrollView>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6B7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by guest name, email or booking ID"
            placeholderTextColor="#9CA3AF"
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Date Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersContainer}
          contentContainerStyle={{ flexGrow: 0 }}
        >
          {['all', 'today', 'week', 'month'].map((range) => (
            <TouchableOpacity
              key={range}
              style={[styles.filterChip, dateRange === range && styles.filterChipActive]}
              onPress={() => setDateRange(range)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  dateRange === range && styles.filterChipTextActive,
                ]}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Status Tabs */}
        <ScrollView horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsContainer}>
          {['all', 'pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Bookings List */}
        <FlatList
          data={filteredBookings}
          renderItem={renderBookingCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.bookingsList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="calendar-outline" size={40} color="#9CA3AF" />
              </View>
              <Text style={styles.emptyTitle}>No bookings found</Text>
              <Text style={styles.emptySubtitle}>
                {searchTerm || dateRange !== 'all' || activeTab !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Your bookings will appear here'}
              </Text>
              {activeTab === 'all' && !searchTerm && dateRange === 'all' && (
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => router.push('/(tabs)/bookings/new' as any)}
                >
                  <Text style={styles.emptyButtonText}>Add Booking</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  addButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 16,
  },
  statsContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  statCard: {
    width: 140,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: '#111827',
  },
  filtersContainer: {
    marginBottom: 8,
    paddingHorizontal: 16,
    height: 70,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 36,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: '#DBEAFE',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#1E3A8A',
  },
  tabsContainer: {
    marginBottom: 8,
    paddingHorizontal: 16,
    height: 70,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 36,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#1E3A8A',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#fff',
  },
  bookingsList: {
    padding: 16,
  },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  guestName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  guestEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  refundBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  refundText: {
    fontSize: 12,
    color: '#92400E',
    marginLeft: 8,
    fontWeight: '600',
    flex: 1,
  },
  bookingDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  amountLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  amount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E3A8A',
    marginTop: 2,
  },
  paymentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  paymentText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  quickActions: {
    flexDirection: 'row',
    marginTop: 12,
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 6,
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 6,
  },
  rejectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 80,
    height: 80,
    backgroundColor: '#F3F4F6',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});