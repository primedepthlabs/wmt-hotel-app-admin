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
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Property, getMainImage, propertyAPI } from '../../../lib/property';

export default function PropertiesScreen() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [stats, setStats] = useState({
    totalProperties: 0,
    activeProperties: 0,
    totalRooms: 0,
    availableRooms: 0,
    occupancyRate: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPropertiesAndStats();
  }, [activeTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPropertiesAndStats();
    setRefreshing(false);
  }, [activeTab]);

  const loadPropertiesAndStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const [propertiesData, statsData] = await Promise.all([
        propertyAPI.getAll(activeTab),
        propertyAPI.getStats(),
      ]);

      setProperties(propertiesData);
      setStats(statsData);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.message || 'Failed to load properties');
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: err.message || 'Failed to load properties',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredProperties = properties.filter((property) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      property.name?.toLowerCase().includes(searchLower) ||
      property.city?.toLowerCase().includes(searchLower) ||
      property.property_type?.toLowerCase().includes(searchLower)
    );
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusStyle = (status: string) => {
    const statusMap: { [key: string]: any } = {
      active: { backgroundColor: '#D1FAE5', color: '#065F46' },
      inactive: { backgroundColor: '#FEE2E2', color: '#991B1B' },
      pending_approval: { backgroundColor: '#FEF3C7', color: '#92400E' },
      suspended: { backgroundColor: '#FFEDD5', color: '#9A3412' },
    };
    return statusMap[status] || { backgroundColor: '#F3F4F6', color: '#1F2937' };
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E3A8A" />
        <Text style={styles.loadingText}>Loading properties...</Text>
      </View>
    );
  }

  if (error && !refreshing) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorIcon}>
          <Ionicons name="alert-circle" size={40} color="#EF4444" />
        </View>
        <Text style={styles.errorTitle}>Error Loading Properties</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadPropertiesAndStats}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>My Properties</Text>
            <Text style={styles.headerSubtitle}>Manage your hotel properties and room inventory</Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/properties/add' as any)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#1E3A8A', '#1E40AF']}
              style={styles.addButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Property</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>My Properties</Text>
              <View style={styles.statIcon}>
                <Ionicons name="business" size={20} color="#1E3A8A" />
              </View>
            </View>
            <Text style={styles.statValue}>{stats.totalProperties}</Text>
            <Text style={styles.statSubtext}>{stats.activeProperties} active</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Total Rooms</Text>
              <View style={styles.statIcon}>
                <Ionicons name="bed" size={20} color="#1E3A8A" />
              </View>
            </View>
            <Text style={styles.statValue}>{stats.totalRooms}</Text>
            <Text style={styles.statSubtext}>Across all properties</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Avg Occupancy</Text>
              <View style={styles.statIcon}>
                <Ionicons name="stats-chart" size={20} color="#1E3A8A" />
              </View>
            </View>
            <Text style={styles.statValue}>{stats.occupancyRate}%</Text>
            <Text style={styles.statSubtext}>Current occupancy</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statLabel}>Available</Text>
              <View style={styles.statIcon}>
                <Ionicons name="checkmark-circle" size={20} color="#1E3A8A" />
              </View>
            </View>
            <Text style={styles.statValue}>{stats.availableRooms}</Text>
            <Text style={styles.statSubtext}>Ready for booking</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6B7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your properties..."
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
          {['all', 'active', 'inactive', 'suspended', 'pending_approval'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'all' ? 'All' : tab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Properties List */}
        <View style={styles.propertiesContainer}>
          {filteredProperties.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="business" size={40} color="#9CA3AF" />
              </View>
              <Text style={styles.emptyTitle}>No properties found</Text>
              <Text style={styles.emptySubtitle}>
                {searchTerm ? 'Try adjusting your search terms' : 'Get started by adding your first property'}
              </Text>
              {!searchTerm && (
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => router.push('/properties/add' as any)}
                >
                  <Text style={styles.emptyButtonText}>Add Property</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredProperties.map((property) => (
              <TouchableOpacity
                key={property.id}
                style={styles.propertyCard}
                onPress={() => router.push(`/properties/${property.id}` as any)}
                activeOpacity={0.7}
              >
                <Image
                  source={{ uri: getMainImage(property) || 'https://via.placeholder.com/400x250' }}
                  style={styles.propertyImage}
                  resizeMode="cover"
                />

                <View style={[styles.statusBadge, getStatusStyle(property.status)]}>
                  <Text style={[styles.statusText, { color: getStatusStyle(property.status).color }]}>
                    {property.status.replace('_', ' ')}
                  </Text>
                </View>

                <View style={styles.propertyTypeBadge}>
                  <Text style={styles.propertyTypeText}>{property.property_type}</Text>
                </View>

                <View style={styles.propertyInfo}>
                  <Text style={styles.propertyName}>{property.name}</Text>
                  <View style={styles.propertyLocation}>
                    <Ionicons name="location-outline" size={14} color="#6B7280" />
                    <Text style={styles.propertyLocationText}>
                      {property.city}{property.area ? `, ${property.area}` : ''}
                    </Text>
                  </View>

                  {property.price && (
                    <Text style={styles.propertyPrice}>{formatCurrency(property.price)}/night</Text>
                  )}

                  {property.rating && property.rating > 0 && (
                    <View style={styles.ratingContainer}>
                      {[...Array(5)].map((_, i) => (
                        <Ionicons
                          key={i}
                          name={i < Math.floor(property.rating!) ? 'star' : 'star-outline'}
                          size={14}
                          color={i < Math.floor(property.rating!) ? '#FBBF24' : '#D1D5DB'}
                        />
                      ))}
                      <Text style={styles.ratingText}>{property.rating}</Text>
                    </View>
                  )}

                  <View style={styles.propertyStats}>
                    <View style={styles.statItem}>
                      <Text style={styles.statItemValue}>{property.reviews_count || 0}</Text>
                      <Text style={styles.statItemLabel}>Reviews</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statItemValue}>{formatCurrency(property.total_revenue || 0)}</Text>
                      <Text style={styles.statItemLabel}>Revenue</Text>
                    </View>
                  </View>

                  <View style={styles.propertyActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => router.push(`/properties/${property.id}` as any)}
                    >
                      <Text style={styles.actionButtonText}>View Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButtonPrimary}
                      onPress={() => router.push(`/properties/${property.id}/rooms` as any)}
                    >
                      <Text style={styles.actionButtonPrimaryText}>Manage Rooms</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  addButton: {
    borderRadius: 10,
    overflow: 'hidden',
    minWidth: 140,
    maxWidth: 160,

  },
  addButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
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
    width: 32,
    height: 32,
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  statSubtext: {
    fontSize: 12,
    color: '#6B7280',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
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
  tabsContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
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
  propertiesContainer: {
    padding: 16,
    gap: 16,
  },
  propertyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  propertyImage: {
    width: '100%',
    height: 200,
  },
  statusBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  propertyTypeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  propertyTypeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'capitalize',
  },
  propertyInfo: {
    padding: 16,
  },
  propertyName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 6,
  },
  propertyLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  propertyLocationText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 4,
  },
  propertyPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E3A8A',
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ratingText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 6,
  },
  propertyStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statItemValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  statItemLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  propertyActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  actionButtonPrimary: {
    flex: 1,
    height: 40,
    backgroundColor: '#1E3A8A',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
  bottomPadding: {
    height: 24,
  },
});