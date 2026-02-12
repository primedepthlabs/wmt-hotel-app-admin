import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../../../lib/supabaseClient';

const { width } = Dimensions.get('window');

const ID_TYPES = [
  { label: 'Passport', value: 'passport' },
  { label: 'Driving License', value: 'driving-license' },
  { label: 'National ID', value: 'national-id' },
  { label: 'Aadhaar Card', value: 'aadhaar' },
];

export default function GuestManagementScreen() {
  const router = useRouter();
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'vip' | 'regular' | 'new'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'bookings' | 'spent'>('recent');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [stats, setStats] = useState({
    totalGuests: 0,
    vipGuests: 0,
    currentlyStaying: 0,
    repeatGuestRate: 0,
  });

  const [newGuest, setNewGuest] = useState({
    name: '',
    email: '',
    phone: '',
    nationality: '',
    idType: '',
    idNumber: '',
    address: '',
    emergencyContact: '',
    emergencyPhone: '',
    specialRequests: '',
  });

  const fetchGuests = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: userHotels } = await supabase
        .from('hotels')
        .select('id')
        .eq('owner_id', user.id);

      if (!userHotels || userHotels.length === 0) {
        setGuests([]);
        calculateStats([]);
        return;
      }

      const hotelIds = userHotels.map(h => h.id);

      const { data: roomTypes } = await supabase
        .from('room_types')
        .select('id')
        .in('property_id', hotelIds);

      if (!roomTypes || roomTypes.length === 0) {
        setGuests([]);
        calculateStats([]);
        return;
      }

      const roomTypeIds = roomTypes.map(rt => rt.id);

      const { data: bookings } = await supabase
        .from('bookings')
        .select('guest_id, room_type_id, status, check_in_date, check_out_date, total_amount, created_at')
        .in('room_type_id', roomTypeIds)
        .not('guest_id', 'is', null);

      if (!bookings || bookings.length === 0) {
        setGuests([]);
        calculateStats([]);
        return;
      }

      const guestIds = [...new Set(bookings.map(b => b.guest_id).filter(Boolean))];

      const { data: guestData } = await supabase
        .from('guests')
        .select('*')
        .in('id', guestIds)
        .order('created_at', { ascending: false });

      const enhancedGuests = (guestData || []).map(guest => {
        const guestBookings = bookings.filter(b => b.guest_id === guest.id);
        const totalBookings = guestBookings.length;
        const totalSpent = guestBookings.reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0);
        const lastVisit = guestBookings.length > 0
          ? guestBookings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].check_in_date
          : null;
        const currentBooking = guestBookings.find(b => b.status === 'checked-in');

        return {
          ...guest,
          total_bookings: totalBookings,
          total_spent: totalSpent,
          last_visit: lastVisit,
          current_booking_status: currentBooking?.status || null,
          current_room: currentBooking ? 'Room Info' : null,
          current_check_in: currentBooking?.check_in_date || null,
        };
      });

      setGuests(enhancedGuests);
      calculateStats(enhancedGuests);
    } catch (error) {
      console.error('Error fetching guests:', error);
      Alert.alert('Error', 'Failed to load guests');
      setGuests([]);
      calculateStats([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const calculateStats = (guestData: any[]) => {
    const total = guestData.length;
    const vip = guestData.filter(g => g.status === 'vip').length;
    const staying = guestData.filter(g => g.current_booking_status === 'checked-in').length;
    const repeat = guestData.filter(g => (g.total_bookings || 0) > 1).length;
    const repeatRate = total > 0 ? Math.round((repeat / total) * 100) : 0;

    setStats({
      totalGuests: total,
      vipGuests: vip,
      currentlyStaying: staying,
      repeatGuestRate: repeatRate,
    });
  };

  const handleAddGuest = async () => {
    if (!newGuest.name || !newGuest.email || !newGuest.phone) {
      Alert.alert('Validation Error', 'Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);

      const guestData = {
        name: newGuest.name,
        email: newGuest.email.toLowerCase(),
        phone: newGuest.phone,
        nationality: newGuest.nationality,
        id_type: newGuest.idType,
        id_number: newGuest.idNumber,
        address: newGuest.address,
        emergency_contact: newGuest.emergencyContact,
        emergency_phone: newGuest.emergencyPhone,
        special_requests: newGuest.specialRequests,
        status: 'new',
      };

      const { error } = await supabase.from('guests').insert([guestData]);

      if (error) {
        if (error.code === '23505') {
          throw new Error('A guest with this email already exists');
        }
        throw error;
      }

      Alert.alert('Success', 'Guest added successfully!');
      setNewGuest({
        name: '',
        email: '',
        phone: '',
        nationality: '',
        idType: '',
        idNumber: '',
        address: '',
        emergencyContact: '',
        emergencyPhone: '',
        specialRequests: '',
      });
      setShowAddModal(false);
      fetchGuests();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add guest');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGuest = (guestId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this guest?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('guests').delete().eq('id', guestId);
              if (error) throw error;
              Alert.alert('Success', 'Guest deleted!');
              fetchGuests();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete guest');
            }
          },
        },
      ]
    );
  };

  const updateGuestStatus = async (guestId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('guests').update({ status: newStatus }).eq('id', guestId);
      if (error) throw error;
      Alert.alert('Success', 'Guest status updated!');
      fetchGuests();
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const exportGuestsData = () => {
    Alert.alert('Export', 'Export functionality would generate a CSV file here');
  };

  const filteredGuests = guests
    .filter(guest => {
      const matchesSearch =
        guest.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        guest.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTab = activeTab === 'all' || guest.status === activeTab;
      return matchesSearch && matchesTab;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        case 'bookings':
          return (b.total_bookings || 0) - (a.total_bookings || 0);
        case 'spent':
          return (b.total_spent || 0) - (a.total_spent || 0);
        default:
          return 0;
      }
    });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'vip':
        return { bg: '#f3e8ff', text: '#7c3aed' };
      case 'regular':
        return { bg: '#dbeafe', text: '#2563eb' };
      case 'new':
        return { bg: '#dcfce7', text: '#16a34a' };
      default:
        return { bg: '#f1f5f9', text: '#64748b' };
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  useEffect(() => {
    fetchGuests();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchGuests();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e3a8a" />
        <Text style={styles.loadingText}>Loading Guests...</Text>
      </View>
    );
  }

  const renderGuestCard = ({ item: guest }: any) => {
    const statusColors = getStatusColor(guest.status);
    return (
      <View style={styles.guestCard}>
        {/* Guest Header */}
        <View style={styles.guestHeader}>
          <View style={styles.guestLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {guest.name
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={styles.guestInfo}>
              <Text style={styles.guestName}>{guest.name}</Text>
              <Text style={styles.guestEmail}>{guest.email}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                <Text style={[styles.statusText, { color: statusColors.text }]}>
                  {guest.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => {
              Alert.alert('Guest Actions', `Actions for ${guest.name}`, [
                {
                  text: guest.status === 'vip' ? 'Remove VIP' : 'Make VIP',
                  onPress: () => updateGuestStatus(guest.id, guest.status === 'vip' ? 'regular' : 'vip'),
                },
                { text: 'View Details', onPress: () => router.push(`/guests/${guest.id}`) },
                { text: 'Delete Guest', onPress: () => handleDeleteGuest(guest.id), style: 'destructive' },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
          >
            <Icon name="dots-vertical" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Guest Contact Details */}
        <View style={styles.guestDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Phone</Text>
            <Text style={styles.detailValue}>{guest.phone || 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Nationality</Text>
            <Text style={styles.detailValue}>{guest.nationality || 'N/A'}</Text>
          </View>
        </View>

        {/* Guest Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{guest.total_bookings || 0}</Text>
            <Text style={styles.statLabel}>Bookings</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatCurrency(guest.total_spent)}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValueDate}>{formatDate(guest.last_visit)}</Text>
            <Text style={styles.statLabel}>Last Visit</Text>
          </View>
        </View>

        {/* Currently Checked In Badge */}
        {guest.current_booking_status === 'checked-in' && (
          <View style={styles.currentBooking}>
            <Icon name="home-account" size={14} color="#1e3a8a" style={{ marginRight: 4 }} />
            <Text style={styles.currentBookingText}>Currently Checked In</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionButtonOutline}
            onPress={() => router.push(`/guests/${guest.id}`)}
          >
            <Text style={styles.actionButtonOutlineText}>View Details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              Alert.alert('New Booking', `Create booking for ${guest.name}`);
            }}
          >
            <Text style={styles.actionButtonText}>New Booking</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Guest Management</Text>
            <Text style={styles.subtitle}>Manage guest profiles</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.exportButton} onPress={exportGuestsData}>
              <Icon name="download" size={20} color="#1e3a8a" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
              <Icon name="plus" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Cards - More Compact */}
        <View style={styles.statsSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsContentContainer}
          >
            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: '#e0e7ff' }]}>
                <Icon name="account-group" size={20} color="#1e3a8a" />
              </View>
              <Text style={styles.statCardValue}>{stats.totalGuests}</Text>
              <Text style={styles.statCardLabel}>Total Guests</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: '#f3e8ff' }]}>
                <Icon name="star" size={20} color="#7c3aed" />
              </View>
              <Text style={styles.statCardValue}>{stats.vipGuests}</Text>
              <Text style={styles.statCardLabel}>VIP Guests</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: '#dbeafe' }]}>
                <Icon name="home-account" size={20} color="#2563eb" />
              </View>
              <Text style={styles.statCardValue}>{stats.currentlyStaying}</Text>
              <Text style={styles.statCardLabel}>Currently Staying</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: '#dcfce7' }]}>
                <Icon name="refresh" size={20} color="#16a34a" />
              </View>
              <Text style={styles.statCardValue}>{stats.repeatGuestRate}%</Text>
              <Text style={styles.statCardLabel}>Repeat Rate</Text>
            </View>
          </ScrollView>
        </View>

        {/* Search and Filter */}
        <View style={styles.filterContainer}>
          <View style={styles.searchContainer}>
            <Icon name="magnify" size={20} color="#64748b" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search guests..."
              placeholderTextColor="#94a3b8"
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
            {searchTerm.length > 0 && (
              <TouchableOpacity onPress={() => setSearchTerm('')}>
                <Icon name="close-circle" size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.sortButton} onPress={() => setShowSortModal(true)}>
            <Icon name="tune-variant" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Filter Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            {(['all', 'vip', 'regular', 'new'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Guest List */}
        <FlatList
          data={filteredGuests}
          renderItem={renderGuestCard}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.guestList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#1e3a8a']}
              tintColor="#1e3a8a"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Icon name="account-off" size={48} color="#cbd5e1" />
              </View>
              <Text style={styles.emptyTitle}>No guests found</Text>
              <Text style={styles.emptyText}>
                {searchTerm
                  ? 'Try adjusting your search or filters'
                  : activeTab !== 'all'
                    ? `No ${activeTab} guests available`
                    : 'No guests have made bookings yet'}
              </Text>
            </View>
          }
        />

        {/* Add Guest Modal */}
        <Modal visible={showAddModal} animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add New Guest</Text>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Icon name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionTitle}>Personal Information</Text>

                <Text style={styles.inputLabel}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  value={newGuest.name}
                  onChangeText={text => setNewGuest({ ...newGuest, name: text })}
                  placeholder="Enter full name"
                  placeholderTextColor="#94a3b8"
                />

                <Text style={styles.inputLabel}>Email *</Text>
                <TextInput
                  style={styles.input}
                  value={newGuest.email}
                  onChangeText={text => setNewGuest({ ...newGuest, email: text })}
                  placeholder="Enter email"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={styles.inputLabel}>Phone *</Text>
                <TextInput
                  style={styles.input}
                  value={newGuest.phone}
                  onChangeText={text => setNewGuest({ ...newGuest, phone: text })}
                  placeholder="Enter phone number"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputLabel}>Nationality</Text>
                <TextInput
                  style={styles.input}
                  value={newGuest.nationality}
                  onChangeText={text => setNewGuest({ ...newGuest, nationality: text })}
                  placeholder="Enter nationality"
                  placeholderTextColor="#94a3b8"
                />

                <Text style={styles.sectionTitle}>Identification</Text>

                <Text style={styles.inputLabel}>ID Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.idTypeContainer}>
                    {ID_TYPES.map(type => (
                      <TouchableOpacity
                        key={type.value}
                        style={[styles.idTypeChip, newGuest.idType === type.value && styles.idTypeChipActive]}
                        onPress={() => setNewGuest({ ...newGuest, idType: type.value })}
                      >
                        <Text
                          style={[
                            styles.idTypeText,
                            newGuest.idType === type.value && styles.idTypeTextActive,
                          ]}
                        >
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text style={styles.inputLabel}>ID Number</Text>
                <TextInput
                  style={styles.input}
                  value={newGuest.idNumber}
                  onChangeText={text => setNewGuest({ ...newGuest, idNumber: text })}
                  placeholder="Enter ID number"
                  placeholderTextColor="#94a3b8"
                />

                <Text style={styles.inputLabel}>Address</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={newGuest.address}
                  onChangeText={text => setNewGuest({ ...newGuest, address: text })}
                  placeholder="Enter address"
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={2}
                />

                <Text style={styles.sectionTitle}>Emergency Contact</Text>

                <Text style={styles.inputLabel}>Contact Name</Text>
                <TextInput
                  style={styles.input}
                  value={newGuest.emergencyContact}
                  onChangeText={text => setNewGuest({ ...newGuest, emergencyContact: text })}
                  placeholder="Enter emergency contact name"
                  placeholderTextColor="#94a3b8"
                />

                <Text style={styles.inputLabel}>Contact Phone</Text>
                <TextInput
                  style={styles.input}
                  value={newGuest.emergencyPhone}
                  onChangeText={text => setNewGuest({ ...newGuest, emergencyPhone: text })}
                  placeholder="Enter emergency contact phone"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputLabel}>Special Requests</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={newGuest.specialRequests}
                  onChangeText={text => setNewGuest({ ...newGuest, specialRequests: text })}
                  placeholder="Any special requirements"
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={3}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setShowAddModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveButton, submitting && styles.saveButtonDisabled]}
                    onPress={handleAddGuest}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Add Guest</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Sort Modal */}
        <Modal visible={showSortModal} animationType="fade" transparent>
          <TouchableOpacity
            style={styles.sortModalOverlay}
            activeOpacity={1}
            onPress={() => setShowSortModal(false)}
          >
            <View style={styles.sortModalContent}>
              <Text style={styles.sortModalTitle}>Sort By</Text>
              {[
                { label: 'Most Recent', value: 'recent', icon: 'clock-outline' },
                { label: 'Name A-Z', value: 'name', icon: 'sort-alphabetical-ascending' },
                { label: 'Most Bookings', value: 'bookings', icon: 'calendar-multiple' },
                { label: 'Highest Spent', value: 'spent', icon: 'currency-inr' },
              ].map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.sortOption}
                  onPress={() => {
                    setSortBy(option.value as any);
                    setShowSortModal(false);
                  }}
                >
                  <View style={styles.sortOptionLeft}>
                    <Icon name={option.icon} size={20} color={sortBy === option.value ? '#1e3a8a' : '#64748b'} />
                    <Text style={[styles.sortOptionText, sortBy === option.value && styles.sortOptionTextActive]}>
                      {option.label}
                    </Text>
                  </View>
                  {sortBy === option.value && (
                    <View style={styles.checkmarkContainer}>
                      <Icon name="check-circle" size={20} color="#1e3a8a" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  exportButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e3a8a',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1e3a8a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  // Compact Stats Section
  statsSection: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  statsContentContainer: {
    paddingHorizontal: 16,
    gap: 10,
  },
  statCard: {
    width: 110,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statCardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  statCardLabel: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '500',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: '#f8fafc',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#0f172a',
  },
  sortButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabsContainer: {
    backgroundColor: '#f8fafc',
    paddingBottom: 16,
  },
  tabsContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#e2e8f0',
  },
  tabActive: {
    backgroundColor: '#1e3a8a',
  },
  tabText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  guestList: {
    padding: 20,
    paddingTop: 4,
  },
  guestCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  guestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  guestLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e3a8a',
    letterSpacing: 0.5,
  },
  guestInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  guestName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  guestEmail: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  menuButton: {
    padding: 4,
    marginTop: 4,
  },
  guestDetails: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#e2e8f0',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  statValueDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  currentBooking: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
    padding: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  currentBookingText: {
    fontSize: 13,
    color: '#1e3a8a',
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButtonOutline: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  actionButtonOutlineText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    shadowColor: '#1e3a8a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  formScroll: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 20,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  idTypeContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  idTypeChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  idTypeChipActive: {
    backgroundColor: '#1e3a8a',
    borderColor: '#1e3a8a',
  },
  idTypeText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  idTypeTextActive: {
    color: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
    marginBottom: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    shadowColor: '#1e3a8a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  sortModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sortModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 20,
  },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  sortOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sortOptionText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
  sortOptionTextActive: {
    color: '#1e3a8a',
    fontWeight: '600',
  },
  checkmarkContainer: {
    marginLeft: 'auto',
  },
});