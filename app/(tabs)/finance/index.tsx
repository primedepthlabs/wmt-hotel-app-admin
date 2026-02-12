import { supabase } from '@/lib/supabaseClient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { BarChart, PieChart } from 'react-native-chart-kit';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const { width } = Dimensions.get('window');

const EXPENSE_CATEGORIES = [
  'Marketing & Advertising',
  'Maintenance & Repairs',
  'Utilities',
  'Staff Salaries',
  'Supplies',
  'Insurance',
  'Taxes',
  'Professional Services',
  'Equipment',
  'Other',
];

const INCOME_CATEGORIES = [
  'Direct Bookings',
  'Events & Functions',
  'Food & Beverage',
  'Spa & Wellness',
  'Laundry Services',
  'Transportation',
  'Tour Packages',
  'Other Services',
];

export default function FinanceDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<'combined' | 'crm' | 'manual'>('combined');
  const [activeTab, setActiveTab] = useState<'overview' | 'manual' | 'payouts' | 'commission'>('overview');
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingFinance, setEditingFinance] = useState<any>(null);
  
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState<any[]>([]);
  const [manualFinances, setManualFinances] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  
  const [stats, setStats] = useState({
    totalEarnings: 0,
    netRevenue: 0,
    pendingPayouts: 0,
    averageRevPAR: 0,
    occupancyRate: 0,
    averageDailyRate: 0,
    guestRating: 0,
    commissionRate: 10,
    manualIncome: 0,
    manualExpenses: 0,
    manualNet: 0,
    combinedRevenue: 0,
    combinedNet: 0,
  });

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    amount: '',
    type: 'income' as 'income' | 'expense',
    category: '',
    date: new Date().toISOString().split('T')[0],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const fetchManualFinances = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('manual_finances')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (error) throw error;
      setManualFinances(data || []);
      return data || [];
    } catch (error) {
      console.error('Error fetching manual finances:', error);
      return [];
    }
  };

  const fetchFinancialData = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: userHotels } = await supabase
        .from('hotels')
        .select('id, name, price, original_price, rating')
        .eq('owner_id', user.id);

      if (!userHotels || userHotels.length === 0) {
        const manualFinances = await fetchManualFinances();
        await processCombinedFinancialData([], [], [], manualFinances);
        return;
      }

      const hotelIds = userHotels.map(h => h.id);

      const { data: roomTypes } = await supabase
        .from('room_types')
        .select('id, property_id, base_rate, total_rooms')
        .in('property_id', hotelIds);

      if (!roomTypes || roomTypes.length === 0) {
        const manualFinances = await fetchManualFinances();
        await processCombinedFinancialData([], [], userHotels, manualFinances);
        return;
      }

      const roomTypeIds = roomTypes.map(rt => rt.id);

      const { data: bookings } = await supabase
        .from('bookings')
        .select(`*, guests(name, email), room_types(name, base_rate, property_id)`)
        .in('room_type_id', roomTypeIds)
        .gte('created_at', new Date(new Date().getFullYear(), 0, 1).toISOString())
        .order('created_at', { ascending: false });

      const manualFinances = await fetchManualFinances();
      await processCombinedFinancialData(bookings || [], roomTypes, userHotels, manualFinances);
    } catch (error) {
      console.error('Error fetching financial data:', error);
      Alert.alert('Error', 'Failed to load financial data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const processCombinedFinancialData = async (bookings: any[], roomTypes: any[], hotels: any[], manualFinances: any[]) => {
    const totalEarnings = bookings.reduce((sum, b) => sum + (parseFloat(b.total_amount) || 0), 0);
    const commissionRate = 0.10;
    const totalCommission = totalEarnings * commissionRate;
    const netRevenue = totalEarnings - totalCommission;

    const manualIncome = manualFinances
      .filter(f => f.type === 'income')
      .reduce((sum, f) => sum + f.amount, 0);
    
    const manualExpenses = manualFinances
      .filter(f => f.type === 'expense')
      .reduce((sum, f) => sum + Math.abs(f.amount), 0);
    
    const manualNet = manualIncome - manualExpenses;
    const combinedRevenue = totalEarnings + manualIncome;
    const combinedNet = netRevenue + manualNet;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyStats: any = {};
    
    months.forEach(month => {
      monthlyStats[month] = {
        month,
        revenue: 0,
        commission: 0,
        net: 0,
        bookings: 0,
        manualIncome: 0,
        manualExpenses: 0,
        manualNet: 0,
        combinedRevenue: 0,
        combinedNet: 0,
      };
    });

    bookings.forEach(booking => {
      const date = new Date(booking.created_at);
      const month = months[date.getMonth()];
      const amount = parseFloat(booking.total_amount) || 0;
      const commission = amount * commissionRate;

      monthlyStats[month].revenue += amount;
      monthlyStats[month].commission += commission;
      monthlyStats[month].net += (amount - commission);
      monthlyStats[month].bookings += 1;
    });

    manualFinances.forEach(finance => {
      const date = new Date(finance.date);
      const month = months[date.getMonth()];
      
      if (finance.type === 'income') {
        monthlyStats[month].manualIncome += finance.amount;
      } else {
        monthlyStats[month].manualExpenses += Math.abs(finance.amount);
      }
      
      monthlyStats[month].manualNet = monthlyStats[month].manualIncome - monthlyStats[month].manualExpenses;
    });

    Object.keys(monthlyStats).forEach(month => {
      const monthData = monthlyStats[month];
      monthData.combinedRevenue = monthData.revenue + monthData.manualIncome;
      monthData.combinedNet = monthData.net + monthData.manualNet;
    });

    setMonthlyData(Object.values(monthlyStats));

    const roomRevenue = totalEarnings * 0.75;
    const foodBeverage = totalEarnings * 0.15;
    const extraServices = totalEarnings * 0.10;

    setRevenueBreakdown([
      { name: 'Room Revenue', value: roomRevenue, color: '#1e3a8a' },
      { name: 'F&B', value: foodBeverage, color: '#3b82f6' },
      { name: 'Extras', value: extraServices, color: '#60a5fa' },
      { name: 'Manual Income', value: manualIncome, color: '#93c5fd' },
    ]);

    const totalRooms = roomTypes.reduce((sum, rt) => sum + (rt.total_rooms || 1), 0);
    const occupiedRoomNights = bookings.filter(b => b.status === 'checked-in' || b.status === 'checked-out').length;
    const totalRoomNights = totalRooms * 30;
    const occupancyRate = totalRoomNights > 0 ? (occupiedRoomNights / totalRoomNights) * 100 : 0;
    const averageDailyRate = bookings.length > 0 ? totalEarnings / bookings.length : 0;
    const averageRevPAR = (occupancyRate / 100) * averageDailyRate;
    const averageRating = hotels.length > 0 ? hotels.reduce((sum, h) => sum + (h.rating || 0), 0) / hotels.length : 0;

    setStats({
      totalEarnings,
      netRevenue,
      pendingPayouts: netRevenue * 0.4,
      averageRevPAR,
      occupancyRate,
      averageDailyRate,
      guestRating: averageRating,
      commissionRate: commissionRate * 100,
      manualIncome,
      manualExpenses,
      manualNet,
      combinedRevenue,
      combinedNet,
    });

    const recentPayouts = Object.values(monthlyStats)
      .slice(-3)
      .map((month: any, index: number) => ({
        id: `PO${String(index + 1).padStart(3, '0')}`,
        amount: month.combinedNet,
        period: `${month.month} 2024`,
        status: index === 0 ? 'pending' : index === 1 ? 'processing' : 'paid',
        date: new Date(2024, months.indexOf(month.month) + 1, 5).toLocaleDateString(),
        method: 'Bank Transfer',
      }));

    setPayouts(recentPayouts.reverse());
  };

  const saveManualFinance = async () => {
    try {
      if (!formData.title || !formData.amount || !formData.category) {
        Alert.alert('Validation Error', 'Please fill in all required fields');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const financeData = {
        title: formData.title,
        description: formData.description || null,
        amount: parseFloat(formData.amount),
        type: formData.type,
        category: formData.category,
        date: formData.date,
      };

      if (editingFinance) {
        const { error } = await supabase
          .from('manual_finances')
          .update(financeData)
          .eq('id', editingFinance.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('manual_finances')
          .insert([{ ...financeData, user_id: user.id }]);
        if (error) throw error;
      }

      Alert.alert('Success', editingFinance ? 'Entry updated!' : 'Entry added!');
      setShowManualForm(false);
      setEditingFinance(null);
      setFormData({
        title: '',
        description: '',
        amount: '',
        type: 'income',
        category: '',
        date: new Date().toISOString().split('T')[0],
      });
      fetchFinancialData();
    } catch (error) {
      console.error('Error saving finance:', error);
      Alert.alert('Error', 'Failed to save entry');
    }
  };

  const deleteManualFinance = async (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('manual_finances')
                .delete()
                .eq('id', id);
              if (error) throw error;
              Alert.alert('Success', 'Entry deleted!');
              fetchFinancialData();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete entry');
            }
          },
        },
      ]
    );
  };

  const getDisplayData = () => {
    switch (activeView) {
      case 'crm':
        return {
          revenue: stats.totalEarnings,
          net: stats.netRevenue,
          chartData: monthlyData.map(m => ({ ...m, revenue: m.revenue, net: m.net })),
        };
      case 'manual':
        return {
          revenue: stats.manualIncome,
          net: stats.manualNet,
          chartData: monthlyData.map(m => ({ ...m, revenue: m.manualIncome, net: m.manualNet })),
        };
      default:
        return {
          revenue: stats.combinedRevenue,
          net: stats.combinedNet,
          chartData: monthlyData.map(m => ({ ...m, revenue: m.combinedRevenue, net: m.combinedNet })),
        };
    }
  };

  useEffect(() => {
    fetchFinancialData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFinancialData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e3a8a" />
        <Text style={styles.loadingText}>Loading Financial Data...</Text>
      </View>
    );
  }

  const displayData = getDisplayData();

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(30, 58, 138, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
    style: { borderRadius: 16 },
    propsForLabels: { fontSize: 10 },
  };

  const barChartData = {
    labels: monthlyData.slice(-6).map(m => m.month),
    datasets: [
      {
        data: displayData.chartData.slice(-6).map(m => m.revenue / 1000),
        color: (opacity = 1) => `rgba(30, 58, 138, ${opacity})`,
      },
      {
        data: displayData.chartData.slice(-6).map(m => m.net / 1000),
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
      },
    ],
    legend: ['Revenue (₹k)', 'Net (₹k)'],
  };

  const pieChartData = revenueBreakdown.map((item, index) => ({
    name: item.name,
    population: item.value,
    color: item.color,
    legendFontColor: '#64748b',
    legendFontSize: 11,
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Finance & Payments</Text>
            <Text style={styles.subtitle}>Track earnings and performance</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Icon name="refresh" size={20} color="#1e3a8a" />
          </TouchableOpacity>
        </View>

        {/* View Toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, activeView === 'combined' && styles.toggleButtonActive]}
            onPress={() => setActiveView('combined')}
          >
            <Text style={[styles.toggleText, activeView === 'combined' && styles.toggleTextActive]}>
              Combined
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, activeView === 'crm' && styles.toggleButtonActive]}
            onPress={() => setActiveView('crm')}
          >
            <Text style={[styles.toggleText, activeView === 'crm' && styles.toggleTextActive]}>
              CRM
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, activeView === 'manual' && styles.toggleButtonActive]}
            onPress={() => setActiveView('manual')}
          >
            <Text style={[styles.toggleText, activeView === 'manual' && styles.toggleTextActive]}>
              Manual
            </Text>
          </TouchableOpacity>
        </View>

        {/* Key Metrics */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Icon name="cash-multiple" size={24} color="#1e3a8a" />
            <Text style={styles.metricValue}>{formatCurrency(displayData.revenue)}</Text>
            <Text style={styles.metricLabel}>
              {activeView === 'manual' ? 'Manual Income' : 'Total Revenue'}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Icon name="chart-line" size={24} color="#10b981" />
            <Text style={styles.metricValue}>{formatCurrency(displayData.net)}</Text>
            <Text style={styles.metricLabel}>Net Revenue</Text>
          </View>

          {activeView === 'manual' && (
            <View style={styles.metricCard}>
              <Icon name="trending-down" size={24} color="#ef4444" />
              <Text style={[styles.metricValue, { color: '#ef4444' }]}>
                {formatCurrency(stats.manualExpenses)}
              </Text>
              <Text style={styles.metricLabel}>Expenses</Text>
            </View>
          )}

          <View style={styles.metricCard}>
            <Icon name="clock-outline" size={24} color="#f59e0b" />
            <Text style={styles.metricValue}>{formatCurrency(stats.pendingPayouts)}</Text>
            <Text style={styles.metricLabel}>Pending</Text>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
            onPress={() => setActiveTab('overview')}
          >
            <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
              Overview
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'manual' && styles.tabActive]}
            onPress={() => setActiveTab('manual')}
          >
            <Text style={[styles.tabText, activeTab === 'manual' && styles.tabTextActive]}>
              Manual
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'payouts' && styles.tabActive]}
            onPress={() => setActiveTab('payouts')}
          >
            <Text style={[styles.tabText, activeTab === 'payouts' && styles.tabTextActive]}>
              Payouts
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Revenue Trends</Text>
              <BarChart
                data={barChartData}
                width={width - 48}
                height={220}
                chartConfig={chartConfig}
                style={styles.chart}
                yAxisSuffix="k"
                fromZero
              />
            </View>

            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Revenue Sources</Text>
              <PieChart
                data={pieChartData}
                width={width - 48}
                height={200}
                chartConfig={chartConfig}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute
              />
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiTitle}>Performance Metrics</Text>
              <View style={styles.kpiGrid}>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiValue}>{stats.occupancyRate.toFixed(1)}%</Text>
                  <Text style={styles.kpiLabel}>Occupancy</Text>
                </View>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiValue}>{formatCurrency(stats.averageDailyRate)}</Text>
                  <Text style={styles.kpiLabel}>Avg Rate</Text>
                </View>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiValue}>{stats.guestRating.toFixed(1)}</Text>
                  <Text style={styles.kpiLabel}>Rating</Text>
                </View>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiValue}>{formatCurrency(stats.manualNet)}</Text>
                  <Text style={styles.kpiLabel}>Manual Net</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'manual' && (
          <View style={styles.tabContent}>
            <View style={styles.manualHeader}>
              <Text style={styles.manualTitle}>Manual Finance Entries</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => {
                  setEditingFinance(null);
                  setFormData({
                    title: '',
                    description: '',
                    amount: '',
                    type: 'income',
                    category: '',
                    date: new Date().toISOString().split('T')[0],
                  });
                  setShowManualForm(true);
                }}
              >
                <Icon name="plus" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {manualFinances.length > 0 ? (
              <>
                {manualFinances.map(finance => (
                  <View key={finance.id} style={styles.financeItem}>
                    <View style={styles.financeLeft}>
                      <View
                        style={[
                          styles.financeIcon,
                          { backgroundColor: finance.type === 'income' ? '#dcfce7' : '#fee2e2' },
                        ]}
                      >
                        <Icon
                          name={finance.type === 'income' ? 'trending-up' : 'trending-down'}
                          size={20}
                          color={finance.type === 'income' ? '#10b981' : '#ef4444'}
                        />
                      </View>
                      <View style={styles.financeInfo}>
                        <Text style={styles.financeTitle}>{finance.title}</Text>
                        <Text style={styles.financeCategory}>{finance.category}</Text>
                        <Text style={styles.financeDate}>
                          {new Date(finance.date).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.financeRight}>
                      <Text
                        style={[
                          styles.financeAmount,
                          { color: finance.type === 'income' ? '#10b981' : '#ef4444' },
                        ]}
                      >
                        {finance.type === 'income' ? '+' : '-'}
                        {formatCurrency(Math.abs(finance.amount))}
                      </Text>
                      <View style={styles.financeActions}>
                        <TouchableOpacity
                          onPress={() => {
                            setEditingFinance(finance);
                            setFormData({
                              title: finance.title,
                              description: finance.description || '',
                              amount: finance.amount.toString(),
                              type: finance.type,
                              category: finance.category,
                              date: finance.date,
                            });
                            setShowManualForm(true);
                          }}
                        >
                          <Icon name="pencil" size={18} color="#64748b" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteManualFinance(finance.id)}>
                          <Icon name="delete" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}

                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Summary</Text>
                  <View style={styles.summaryGrid}>
                    <View style={[styles.summaryItem, { backgroundColor: '#dcfce7' }]}>
                      <Text style={[styles.summaryValue, { color: '#10b981' }]}>
                        {formatCurrency(stats.manualIncome)}
                      </Text>
                      <Text style={styles.summaryLabel}>Income</Text>
                    </View>
                    <View style={[styles.summaryItem, { backgroundColor: '#fee2e2' }]}>
                      <Text style={[styles.summaryValue, { color: '#ef4444' }]}>
                        {formatCurrency(stats.manualExpenses)}
                      </Text>
                      <Text style={styles.summaryLabel}>Expenses</Text>
                    </View>
                    <View style={[styles.summaryItem, { backgroundColor: '#dbeafe' }]}>
                      <Text
                        style={[
                          styles.summaryValue,
                          { color: stats.manualNet >= 0 ? '#10b981' : '#ef4444' },
                        ]}
                      >
                        {formatCurrency(stats.manualNet)}
                      </Text>
                      <Text style={styles.summaryLabel}>Net</Text>
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Icon name="cash-plus" size={48} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No entries yet</Text>
                <Text style={styles.emptyText}>Add your first income or expense entry</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'payouts' && (
          <View style={styles.tabContent}>
            <Text style={styles.payoutsTitle}>Payout History</Text>
            {payouts.length > 0 ? (
              payouts.map(payout => (
                <View key={payout.id} style={styles.payoutItem}>
                  <View style={styles.payoutLeft}>
                    <Icon name="bank-transfer" size={24} color="#1e3a8a" />
                    <View style={styles.payoutInfo}>
                      <Text style={styles.payoutAmount}>{formatCurrency(payout.amount)}</Text>
                      <Text style={styles.payoutPeriod}>{payout.period}</Text>
                    </View>
                  </View>
                  <View style={styles.payoutRight}>
                    <Text style={styles.payoutDate}>{payout.date}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            payout.status === 'paid'
                              ? '#dcfce7'
                              : payout.status === 'processing'
                              ? '#dbeafe'
                              : '#fef3c7',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          {
                            color:
                              payout.status === 'paid'
                                ? '#10b981'
                                : payout.status === 'processing'
                                ? '#3b82f6'
                                : '#f59e0b',
                          },
                        ]}
                      >
                        {payout.status}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Icon name="cash-clock" size={48} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No payouts yet</Text>
                <Text style={styles.emptyText}>Payouts will appear after completed bookings</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Manual Finance Form Modal */}
      <Modal visible={showManualForm} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingFinance ? 'Edit Entry' : 'Add Entry'}
              </Text>
              <TouchableOpacity onPress={() => setShowManualForm(false)}>
                <Icon name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll}>
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={formData.title}
                onChangeText={text => setFormData({ ...formData, title: text })}
                placeholder="Enter title"
              />

              <Text style={styles.inputLabel}>Amount *</Text>
              <TextInput
                style={styles.input}
                value={formData.amount}
                onChangeText={text => setFormData({ ...formData, amount: text })}
                placeholder="Enter amount"
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Type *</Text>
              <View style={styles.typeToggle}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    formData.type === 'income' && styles.typeButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, type: 'income', category: '' })}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      formData.type === 'income' && styles.typeButtonTextActive,
                    ]}
                  >
                    Income
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    formData.type === 'expense' && styles.typeButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, type: 'expense', category: '' })}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      formData.type === 'expense' && styles.typeButtonTextActive,
                    ]}
                  >
                    Expense
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Category *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categoryContainer}>
                  {(formData.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(
                    cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.categoryChip,
                          formData.category === cat && styles.categoryChipActive,
                        ]}
                        onPress={() => setFormData({ ...formData, category: cat })}
                      >
                        <Text
                          style={[
                            styles.categoryChipText,
                            formData.category === cat && styles.categoryChipTextActive,
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              </ScrollView>

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={text => setFormData({ ...formData, description: text })}
                placeholder="Enter description (optional)"
                multiline
                numberOfLines={3}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowManualForm(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={saveManualFinance}>
                  <Text style={styles.saveButtonText}>
                    {editingFinance ? 'Update' : 'Add'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
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
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  viewToggle: {
    flexDirection: 'row',
    margin: 20,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#1e3a8a',
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  metricCard: {
    width: (width - 48) / 2,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    margin: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#1e3a8a',
  },
  tabText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  tabContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  chartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  kpiCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  kpiItem: {
    width: (width - 88) / 2,
    alignItems: 'center',
    paddingVertical: 12,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e3a8a',
  },
  kpiLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  manualHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  manualTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  addButton: {
    backgroundColor: '#1e3a8a',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  financeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  financeLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  financeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  financeInfo: {
    flex: 1,
  },
  financeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  financeCategory: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  financeDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  financeRight: {
    alignItems: 'flex-end',
  },
  financeAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  financeActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryItem: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
  },
  payoutsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
  },
  payoutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  payoutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  payoutInfo: {
    marginLeft: 12,
  },
  payoutAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  payoutPeriod: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  payoutRight: {
    alignItems: 'flex-end',
  },
  payoutDate: {
    fontSize: 12,
    color: '#64748b',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  formScroll: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
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
    height: 80,
    textAlignVertical: 'top',
  },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  typeButtonText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  typeButtonTextActive: {
    color: '#1e3a8a',
    fontWeight: '600',
  },
  categoryContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  categoryChipActive: {
    backgroundColor: '#1e3a8a',
    borderColor: '#1e3a8a',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
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
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});