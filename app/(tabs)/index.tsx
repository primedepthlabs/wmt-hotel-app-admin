import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

// Interfaces
interface DashboardStats {
  totalBookings: number;
  totalRevenue: number;
  checkInsToday: number;
  checkOutsToday: number;
  pendingCheckIns: number;
  pendingCheckOuts: number;
  bookingGrowth: number;
  revenueGrowth: number;
}

interface RecentBooking {
  id: string;
  guest_name: string;
  room_type_name: string;
  created_at: string;
  booking_status: string;
  total_amount: number;
}

interface UserCustomization {
  business_name: string;
  logo_url: string;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalBookings: 0,
    totalRevenue: 0,
    checkInsToday: 0,
    checkOutsToday: 0,
    pendingCheckIns: 0,
    pendingCheckOuts: 0,
    bookingGrowth: 0,
    revenueGrowth: 0,
  });
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [customization, setCustomization] = useState<UserCustomization>({
    business_name: '',
    logo_url: '',
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !authUser) {
        throw new Error('User not authenticated');
      }

      // Get user's customization data
      const { data: userData, error: userError } = await supabase
        .from('hotel_owners')
        .select('business_name, logo_url')
        .eq('id', authUser.id)
        .single();

      if (!userError && userData) {
        setCustomization({
          business_name: userData.business_name || '',
          logo_url: userData.logo_url || '',
        });
      }

      // Get user's hotels/properties
      const { data: userHotels, error: hotelsError } = await supabase
        .from('hotels')
        .select('id')
        .eq('owner_id', authUser.id);

      if (hotelsError) {
        throw new Error('Failed to fetch user properties');
      }

      const hotelIds = userHotels.map((hotel) => hotel.id);

      if (hotelIds.length === 0) {
        setLoading(false);
        return;
      }

      // Get room types for user's hotels
      const { data: roomTypes, error: roomTypesError } = await supabase
        .from('room_types')
        .select('id, property_id')
        .in('property_id', hotelIds);

      if (roomTypesError) {
        throw new Error('Failed to fetch room types');
      }

      const roomTypeIds = roomTypes.map((rt) => rt.id);

      if (roomTypeIds.length === 0) {
        setLoading(false);
        return;
      }

      await Promise.all([
        loadBookingStats(roomTypeIds),
        loadRecentBookings(roomTypeIds),
      ]);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: err instanceof Error ? err.message : 'Failed to load dashboard data',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadBookingStats = async (roomTypeIds: string[]) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const { data: allBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(
          `
          id,
          booking_status,
          total_amount,
          check_in_date,
          check_out_date,
          created_at
        `
        )
        .in('room_type_id', roomTypeIds)
        .neq('booking_status', 'cancelled');

      if (bookingsError) {
        throw new Error('Failed to fetch bookings');
      }

      const totalBookings = allBookings.length;
      const totalRevenue = allBookings.reduce(
        (sum, booking) => sum + (booking.total_amount || 0),
        0
      );

      const checkInsToday = allBookings.filter(
        (booking) =>
          booking.check_in_date === today &&
          ['confirmed', 'pending'].includes(booking.booking_status)
      ).length;

      const checkOutsToday = allBookings.filter(
        (booking) =>
          booking.check_out_date === today && booking.booking_status === 'checked_in'
      ).length;

      const pendingCheckIns = allBookings.filter(
        (booking) =>
          booking.check_in_date === today && booking.booking_status === 'confirmed'
      ).length;

      const pendingCheckOuts = allBookings.filter(
        (booking) =>
          booking.check_out_date === today && booking.booking_status === 'checked_in'
      ).length;

      const thisMonthBookings = allBookings.filter(
        (booking) => new Date(booking.created_at) >= lastMonth
      ).length;

      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      const lastMonthBookings = allBookings.filter((booking) => {
        const createdDate = new Date(booking.created_at);
        return createdDate >= twoMonthsAgo && createdDate < lastMonth;
      }).length;

      const thisMonthRevenue = allBookings
        .filter((booking) => new Date(booking.created_at) >= lastMonth)
        .reduce((sum, booking) => sum + (booking.total_amount || 0), 0);

      const lastMonthRevenue = allBookings
        .filter((booking) => {
          const createdDate = new Date(booking.created_at);
          return createdDate >= twoMonthsAgo && createdDate < lastMonth;
        })
        .reduce((sum, booking) => sum + (booking.total_amount || 0), 0);

      const bookingGrowth =
        lastMonthBookings > 0
          ? ((thisMonthBookings - lastMonthBookings) / lastMonthBookings) * 100
          : 0;

      const revenueGrowth =
        lastMonthRevenue > 0
          ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
          : 0;

      setStats({
        totalBookings,
        totalRevenue,
        checkInsToday,
        checkOutsToday,
        pendingCheckIns,
        pendingCheckOuts,
        bookingGrowth,
        revenueGrowth,
      });
    } catch (err) {
      console.error('Error loading booking stats:', err);
    }
  };

  const loadRecentBookings = async (roomTypeIds: string[]) => {
    try {
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select(
          `
          id,
          guest_name,
          booking_status,
          total_amount,
          created_at,
          room_types (
            name
          )
        `
        )
        .in('room_type_id', roomTypeIds)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        throw new Error('Failed to fetch recent bookings');
      }

      const formattedBookings = bookings.map((booking: any) => ({
        id: booking.id,
        guest_name: booking.guest_name || 'Unknown Guest',
        room_type_name: booking.room_types?.name || 'Unknown Room',
        created_at: booking.created_at,
        booking_status: booking.booking_status || 'pending',
        total_amount: booking.total_amount || 0,
      }));

      setRecentBookings(formattedBookings);
    } catch (err) {
      console.error('Error loading recent bookings:', err);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return styles.statusConfirmed;
      case 'pending':
        return styles.statusPending;
      case 'checked_in':
        return styles.statusCheckedIn;
      case 'checked_out':
        return styles.statusCheckedOut;
      default:
        return styles.statusDefault;
    }
  };

  const GrowthIndicator = ({ growth }: { growth: number }) => {
    const isPositive = growth >= 0;
    return (
      <View style={styles.growthContainer}>
        <Ionicons
          name={isPositive ? 'trending-up' : 'trending-down'}
          size={14}
          color={isPositive ? '#10B981' : '#EF4444'}
        />
        <Text style={[styles.growthText, isPositive ? styles.growthPositive : styles.growthNegative]}>
          {isPositive ? '+' : ''}
          {growth.toFixed(1)}% from last month
        </Text>
      </View>
    );
  };

  const hasCustomBranding = customization.business_name || customization.logo_url;
  const displayName = customization.business_name || 'WriteMyTrip';

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E3A8A" />
        <Text style={styles.loadingText}>Loading dashboard data...</Text>
      </View>
    );
  }

  if (error && !refreshing) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorIcon}>
          <Ionicons name="alert-circle" size={40} color="#EF4444" />
        </View>
        <Text style={styles.errorTitle}>Error Loading Dashboard</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadDashboardData}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Welcome Section */}
        <LinearGradient
          colors={['#DBEAFE', '#BFDBFE']}
          style={styles.welcomeSection}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.welcomeContent}>
            <View style={styles.welcomeLeft}>
              {customization.logo_url && (
                <View style={styles.logoContainer}>
                  <Image
                    source={{ uri: customization.logo_url }}
                    style={styles.logo}
                    resizeMode="contain"
                  />
                </View>
              )}

              <View style={styles.welcomeTextContainer}>
                <Text style={styles.welcomeTitle}>
                  Welcome to{' '}
                  <Text style={styles.brandName}>{displayName}</Text>
                </Text>
                <Text style={styles.welcomeSubtitle}>Business Dashboard</Text>
                <Text style={styles.welcomeDescription}>Don't forget to check your activity</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.addPropertyButton}
              onPress={() => router.push('/properties/add' as any)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#1E3A8A', '#1E40AF']}
                style={styles.addPropertyGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.addPropertyText}>Add Property</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          {/* Total Bookings */}
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Total Bookings</Text>
              <View style={styles.statIcon}>
                <Ionicons name="calendar-outline" size={20} color="#1E3A8A" />
              </View>
            </View>
            <Text style={styles.statValue}>{stats.totalBookings.toLocaleString()}</Text>
            <GrowthIndicator growth={stats.bookingGrowth} />
          </View>

          {/* Revenue */}
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Revenue</Text>
              <View style={styles.statIcon}>
                <Ionicons name="cash-outline" size={20} color="#1E3A8A" />
              </View>
            </View>
            <Text style={styles.statValue}>{formatCurrency(stats.totalRevenue)}</Text>
            <GrowthIndicator growth={stats.revenueGrowth} />
          </View>

          {/* Check-ins Today */}
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Check-ins Today</Text>
              <View style={styles.statIcon}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#1E3A8A" />
              </View>
            </View>
            <Text style={styles.statValue}>{stats.checkInsToday}</Text>
            <Text style={styles.statSubtext}>{stats.pendingCheckIns} pending check-ins</Text>
          </View>

          {/* Check-outs Today */}
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Check-outs Today</Text>
              <View style={styles.statIcon}>
                <Ionicons name="exit-outline" size={20} color="#1E3A8A" />
              </View>
            </View>
            <Text style={styles.statValue}>{stats.checkOutsToday}</Text>
            <Text style={styles.statSubtext}>{stats.pendingCheckOuts} pending check-outs</Text>
          </View>
        </View>

        {/* Recent Bookings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Booking Schedule</Text>
            <Text style={styles.sectionSubtitle}>Latest bookings and reservations</Text>
          </View>

          <View style={styles.bookingsContainer}>
            {recentBookings.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="calendar-outline" size={40} color="#9CA3AF" />
                </View>
                <Text style={styles.emptyText}>No recent bookings found</Text>
              </View>
            ) : (
              recentBookings.map((booking) => (
                <TouchableOpacity
                  key={booking.id}
                  style={styles.bookingCard}
                  onPress={() => router.push(`/bookings/${booking.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.bookingIcon}>
                    <Ionicons name="business" size={24} color="#fff" />
                  </View>
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingRoom}>{booking.room_type_name}</Text>
                    <Text style={styles.bookingGuest}>
                      {booking.guest_name} • {formatTimeAgo(booking.created_at)}
                    </Text>
                    <Text style={styles.bookingAmount}>{formatCurrency(booking.total_amount)}</Text>
                  </View>
                  <View style={[styles.statusBadge, getStatusColor(booking.booking_status)]}>
                    <Text style={styles.statusText}>{booking.booking_status}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <Text style={styles.sectionSubtitle}>Manage your hotel operations</Text>
          </View>

          <View style={styles.quickActionsGrid}>
            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={() => router.push('/properties' as any)}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="add-circle-outline" size={24} color="#1E3A8A" />
              </View>
              <Text style={styles.quickActionText}>Add Room</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={() => router.push('/bookings/new' as any)}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="calendar-outline" size={24} color="#1E3A8A" />
              </View>
              <Text style={styles.quickActionText}>New Booking</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={() => router.push('/guests' as any)}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="people-outline" size={24} color="#1E3A8A" />
              </View>
              <Text style={styles.quickActionText}>Guest List</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={() => router.push('/finance' as any)}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="bar-chart-outline" size={24} color="#1E3A8A" />
              </View>
              <Text style={styles.quickActionText}>Reports</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* About WriteMyTrip - Only show for users without custom branding */}
        {!hasCustomBranding && (
          <LinearGradient
            colors={['#DBEAFE', '#BFDBFE']}
            style={styles.aboutSection}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.aboutHeader}>
              <View style={styles.aboutIconContainer}>
                <Ionicons name="globe-outline" size={32} color="#1E3A8A" />
              </View>
              <Text style={styles.aboutTitle}>About WriteMyTrip</Text>
              <Text style={styles.aboutDescription}>
                Empowering hospitality businesses with cutting-edge technology to deliver exceptional
                travel experiences
              </Text>
            </View>

            <View style={styles.aboutContent}>
              <View style={styles.aboutItem}>
                <View style={styles.aboutItemIcon}>
                  <Ionicons name="flash-outline" size={20} color="#1E3A8A" />
                </View>
                <Text style={styles.aboutItemTitle}>Our Mission</Text>
                <Text style={styles.aboutItemText}>
                  WriteMyTrip is a next-generation OTA platform designed to revolutionize the
                  hospitality industry. We connect travelers with exceptional accommodation
                  experiences.
                </Text>
              </View>

              <View style={styles.aboutItem}>
                <View style={styles.aboutItemIcon}>
                  <Ionicons name="heart-outline" size={20} color="#1E3A8A" />
                </View>
                <Text style={styles.aboutItemTitle}>What We Do</Text>
                <Text style={styles.aboutItemText}>
                  We bridge the gap between modern travelers and unique accommodations through our
                  intuitive platform, helping properties reach a global audience.
                </Text>
              </View>
            </View>

            <View style={styles.aboutStats}>
              <View style={styles.aboutStatItem}>
                <Text style={styles.aboutStatValue}>10K+</Text>
                <Text style={styles.aboutStatLabel}>Active Properties</Text>
              </View>
              <View style={styles.aboutStatItem}>
                <Text style={styles.aboutStatValue}>500K+</Text>
                <Text style={styles.aboutStatLabel}>Happy Guests</Text>
              </View>
              <View style={styles.aboutStatItem}>
                <Text style={styles.aboutStatValue}>50+</Text>
                <Text style={styles.aboutStatLabel}>Countries Served</Text>
              </View>
              <View style={styles.aboutStatItem}>
                <Text style={styles.aboutStatValue}>24/7</Text>
                <Text style={styles.aboutStatLabel}>Customer Support</Text>
              </View>
            </View>

            <View style={styles.aboutActions}>
              <TouchableOpacity
                style={styles.aboutPrimaryButton}
                onPress={() => router.push('/dashboard/properties/add' as any)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#1E3A8A', '#1E40AF']}
                  style={styles.aboutButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.aboutPrimaryButtonText}>Add Your Property</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.aboutSecondaryButton}
                onPress={() => router.push('/help' as any)}
                activeOpacity={0.8}
              >
                <Text style={styles.aboutSecondaryButtonText}>Learn More</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  errorIcon: {
    width: 80,
    height: 80,
    backgroundColor: '#FEE2E2',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  welcomeSection: {
    margin: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  welcomeContent: {
    flexDirection: 'column',
    gap: 16,
  },
  welcomeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logoContainer: {
    width: 64,
    height: 64,
    backgroundColor: '#fff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logo: {
    width: 48,
    height: 48,
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  brandName: {
    color: '#1E3A8A',
  },
  welcomeSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  welcomeDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  addPropertyButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  addPropertyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
  },
  addPropertyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  statIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#DBEAFE',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  statSubtext: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  growthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  growthText: {
    fontSize: 12,
    fontWeight: '600',
  },
  growthPositive: {
    color: '#10B981',
  },
  growthNegative: {
    color: '#EF4444',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  bookingsContainer: {
    gap: 12,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    backgroundColor: '#F3F4F6',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  bookingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  bookingIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#1E3A8A',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookingInfo: {
    flex: 1,
  },
  bookingRoom: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  bookingGuest: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  bookingAmount: {
    fontSize: 13,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statusConfirmed: {
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  statusCheckedIn: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  statusCheckedOut: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  statusDefault: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  aboutSection: {
    margin: 16,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  aboutHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  aboutIconContainer: {
    width: 64,
    height: 64,
    backgroundColor: '#1E3A8A',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  aboutTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  aboutDescription: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
  },
  aboutContent: {
    gap: 20,
    marginBottom: 24,
  },
  aboutItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  aboutItemIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#DBEAFE',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  aboutItemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  aboutItemText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  aboutStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    gap: 16,
  },
  aboutStatItem: {
    width: '48%',
    alignItems: 'center',
  },
  aboutStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E3A8A',
    marginBottom: 4,
  },
  aboutStatLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  aboutActions: {
    gap: 12,
  },
  aboutPrimaryButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  aboutButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  aboutPrimaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  aboutSecondaryButton: {
    borderWidth: 2,
    borderColor: '#1E3A8A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  aboutSecondaryButtonText: {
    color: '#1E3A8A',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 24,
  },
});