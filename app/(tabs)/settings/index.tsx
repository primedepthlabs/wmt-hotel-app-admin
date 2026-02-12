import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
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

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'customization' | 'billing' | 'security'>('profile');
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [passwordVisible, setPasswordVisible] = useState({
    current: false,
    new: false,
    confirm: false,
    billing: false,
  });

  // Profile state
  const [profile, setProfile] = useState({
    id: '',
    full_name: '',
    email: '',
    phone: '',
    mobile: '',
    company_name: '',
  });

  // Customization state
  const [customization, setCustomization] = useState({
    business_name: '',
    logo_url: '',
  });

  // Security state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Billing state
  const [billingData, setBillingData] = useState({
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    pan_number: '',
  });

  const [billingPassword, setBillingPassword] = useState('');
  const [originalBillingData, setOriginalBillingData] = useState({});

  useEffect(() => {
    fetchUserData();
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll permissions to upload logo');
    }
  };

  const fetchUserData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profileData, error: profileError } = await supabase
          .from('hotel_owners')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Profile fetch error:', profileError);
          Alert.alert('Error', 'Failed to load profile data');
        } else {
          setProfile({
            id: profileData.id,
            full_name: profileData.full_name || '',
            email: profileData.email || '',
            phone: profileData.phone || '',
            mobile: profileData.mobile || '',
            company_name: profileData.company_name || '',
          });

          setCustomization({
            business_name: profileData.business_name || '',
            logo_url: profileData.logo_url || '',
          });
        }

        const { data: billingKycData, error: billingError } = await supabase
          .from('owner_kyc')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (billingError && billingError.code !== 'PGRST116') {
          console.error('Billing fetch error:', billingError);
        } else if (billingKycData) {
          const fetchedBillingData = {
            bank_name: billingKycData.bank_name || '',
            account_number: billingKycData.bank_account_number || '',
            ifsc_code: billingKycData.ifsc_code || '',
            pan_number: billingKycData.pan_number || '',
          };
          setBillingData(fetchedBillingData);
          setOriginalBillingData(fetchedBillingData);
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      Alert.alert('Error', 'Failed to load user data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchUserData();
  };

  const handleLogout = async () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoggingOut(true);

              // Sign out from Supabase
              const { error } = await supabase.auth.signOut();

              if (error) {
                throw error;
              }

              // Clear all data from AsyncStorage
              await AsyncStorage.clear();

              // Alternative: Clear specific keys if needed
              // await AsyncStorage.removeItem('userToken');
              // await AsyncStorage.removeItem('userSession');
              // await AsyncStorage.removeItem('userData');

              // Redirect to login screen
            router.replace('/login');
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleProfileSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('hotel_owners')
        .update({
          full_name: profile.full_name,
          phone: profile.phone,
          mobile: profile.mobile,
          company_name: profile.company_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) throw error;

      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Profile update error:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      
      // Check file size (max 5MB)
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        Alert.alert('Error', 'File size must be less than 5MB');
        return;
      }

      setUploadingLogo(true);

      // Convert image to blob for upload
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const fileExt = asset.uri.split('.').pop();
      const fileName = `${profile.id}-logo-${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('business-logos')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('business-logos')
        .getPublicUrl(fileName);

      // Delete old logo if exists
      if (customization.logo_url) {
        const oldFileName = customization.logo_url.split('/').pop();
        await supabase.storage.from('business-logos').remove([oldFileName || '']);
      }

      setCustomization(prev => ({
        ...prev,
        logo_url: publicUrl,
      }));

      Alert.alert('Success', 'Logo uploaded successfully');
    } catch (error) {
      console.error('Logo upload error:', error);
      Alert.alert('Error', 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoRemove = async () => {
    if (!customization.logo_url) return;

    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to remove the logo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);

              const fileName = customization.logo_url.split('/').pop();
              await supabase.storage.from('business-logos').remove([fileName || '']);

              const { error } = await supabase
                .from('hotel_owners')
                .update({
                  logo_url: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', profile.id);

              if (error) throw error;

              setCustomization(prev => ({ ...prev, logo_url: '' }));
              Alert.alert('Success', 'Logo removed successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to remove logo');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleCustomizationSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('hotel_owners')
        .update({
          business_name: customization.business_name,
          logo_url: customization.logo_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) throw error;

      Alert.alert('Success', 'Customization updated successfully');
    } catch (error) {
      console.error('Customization update error:', error);
      Alert.alert('Error', 'Failed to update customization');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    try {
      setSaving(true);

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: passwordData.currentPassword,
      });

      if (signInError) {
        Alert.alert('Error', 'Current password is incorrect');
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (error) throw error;

      Alert.alert('Success', 'Password updated successfully');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error) {
      console.error('Password update error:', error);
      Alert.alert('Error', 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  const checkBillingChanges = () => {
    const hasChanges = Object.keys(billingData).some(
      key => billingData[key] !== originalBillingData[key]
    );

    if (hasChanges) {
      setShowBillingModal(true);
    } else {
      Alert.alert('No Changes', 'No changes detected in billing information');
    }
  };

  const handleBillingSave = async () => {
    if (!billingPassword) {
      Alert.alert('Error', 'Please enter your password to confirm changes');
      return;
    }

    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: billingPassword,
      });

      if (signInError) {
        Alert.alert('Error', 'Password is incorrect');
        return;
      }

      const upsertData = {
        user_id: user.id,
        bank_name: billingData.bank_name || null,
        bank_account_number: billingData.account_number || null,
        ifsc_code: billingData.ifsc_code || null,
        pan_number: billingData.pan_number || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('owner_kyc')
        .upsert(upsertData, {
          onConflict: 'user_id',
          ignoreDuplicates: false,
        });

      if (error) throw error;

      Alert.alert('Success', 'Billing information updated successfully');
      setOriginalBillingData(billingData);
      setShowBillingModal(false);
      setBillingPassword('');
      fetchUserData();
    } catch (error: any) {
      console.error('Billing update error:', error);
      Alert.alert('Error', `Failed to update billing information: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const togglePasswordVisibility = (field: keyof typeof passwordVisible) => {
    setPasswordVisible(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e3a8a" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.subtitle}>Manage your account settings</Text>
          </View>
          <TouchableOpacity 
            style={styles.logoutButton}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <>
                <Icon name="logout" size={20} color="#dc2626" />
                <Text style={styles.logoutText}>Logout</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/settings/profile')}>
          <Text style={styles.kycLink}>View KYC Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
        <View style={styles.tabs}>
          {(['profile', 'customization', 'billing', 'security'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Tab Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'profile' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Profile Information</Text>
            <Text style={styles.cardDescription}>Update your personal information</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={profile.full_name}
                onChangeText={text => setProfile(prev => ({ ...prev, full_name: text }))}
                placeholder="Enter your full name"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={profile.email}
                editable={false}
              />
              <Text style={styles.helperText}>Email cannot be changed</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={profile.phone}
                onChangeText={text => setProfile(prev => ({ ...prev, phone: text }))}
                placeholder="Enter your phone number"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Mobile Number</Text>
              <TextInput
                style={styles.input}
                value={profile.mobile}
                onChangeText={text => setProfile(prev => ({ ...prev, mobile: text }))}
                placeholder="Enter your mobile number"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Company Name</Text>
              <TextInput
                style={styles.input}
                value={profile.company_name}
                onChangeText={text => setProfile(prev => ({ ...prev, company_name: text }))}
                placeholder="Enter your company name"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handleProfileSave}
              disabled={saving}
            >
              <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'customization' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Brand Customization</Text>
            <Text style={styles.cardDescription}>Customize your dashboard branding</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Business Name</Text>
              <TextInput
                style={styles.input}
                value={customization.business_name}
                onChangeText={text => setCustomization(prev => ({ ...prev, business_name: text }))}
                placeholder="Enter your business name"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Business Logo</Text>

              {customization.logo_url ? (
                <View style={styles.logoContainer}>
                  <View style={styles.logoPreview}>
                    <Image source={{ uri: customization.logo_url }} style={styles.logoImage} />
                  </View>
                  <View style={styles.logoInfo}>
                    <Text style={styles.logoTitle}>Logo uploaded</Text>
                    <Text style={styles.logoDescription}>Current business logo</Text>
                  </View>
                  <TouchableOpacity style={styles.removeButton} onPress={handleLogoRemove}>
                    <Icon name="delete" size={24} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadBox} onPress={handleLogoUpload} disabled={uploadingLogo}>
                  <Icon name="cloud-upload" size={48} color="#cbd5e1" />
                  <Text style={styles.uploadTitle}>
                    {uploadingLogo ? 'Uploading...' : 'Upload Business Logo'}
                  </Text>
                  <Text style={styles.uploadDescription}>Click to upload your business logo</Text>
                  <Text style={styles.uploadHint}>PNG, JPG up to 5MB</Text>
                </TouchableOpacity>
              )}

              {customization.logo_url && (
                <View style={styles.logoActions}>
                  <TouchableOpacity
                    style={styles.replaceButton}
                    onPress={handleLogoUpload}
                    disabled={uploadingLogo}
                  >
                    <Icon name="refresh" size={18} color="#1e3a8a" />
                    <Text style={styles.replaceButtonText}>
                      {uploadingLogo ? 'Uploading...' : 'Replace Logo'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {(customization.business_name || customization.logo_url) && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Preview</Text>
                <View style={styles.previewBox}>
                  <View style={styles.previewHeader}>
                    {customization.logo_url && (
                      <View style={styles.previewLogo}>
                        <Image source={{ uri: customization.logo_url }} style={styles.previewLogoImage} />
                      </View>
                    )}
                    <View>
                      <Text style={styles.previewTitle}>
                        Welcome to {customization.business_name || 'Your Business'}
                      </Text>
                      <Text style={styles.previewSubtitle}>Business Dashboard</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.helperText}>This is how your dashboard will appear</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handleCustomizationSave}
              disabled={saving}
            >
              <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Customization'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'billing' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Billing Information</Text>
            <Text style={styles.cardDescription}>Manage your billing details</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Bank Name</Text>
              <TextInput
                style={styles.input}
                value={billingData.bank_name}
                onChangeText={text => setBillingData(prev => ({ ...prev, bank_name: text }))}
                placeholder="Enter bank name"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Account Number</Text>
              <TextInput
                style={styles.input}
                value={billingData.account_number}
                onChangeText={text => setBillingData(prev => ({ ...prev, account_number: text }))}
                placeholder="Enter account number"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>IFSC Code</Text>
              <TextInput
                style={styles.input}
                value={billingData.ifsc_code}
                onChangeText={text => setBillingData(prev => ({ ...prev, ifsc_code: text }))}
                placeholder="Enter IFSC code"
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>PAN Number</Text>
              <TextInput
                style={styles.input}
                value={billingData.pan_number}
                onChangeText={text => setBillingData(prev => ({ ...prev, pan_number: text }))}
                placeholder="Enter PAN number"
                autoCapitalize="characters"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={checkBillingChanges}
              disabled={saving}
            >
              <Text style={styles.buttonText}>{saving ? 'Updating...' : 'Update Billing Info'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'security' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Security Settings</Text>
            <Text style={styles.cardDescription}>Manage your account security</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Current Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={passwordData.currentPassword}
                  onChangeText={text => setPasswordData(prev => ({ ...prev, currentPassword: text }))}
                  placeholder="Enter current password"
                  secureTextEntry={!passwordVisible.current}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => togglePasswordVisibility('current')}
                >
                  <Icon name={passwordVisible.current ? 'eye-off' : 'eye'} size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>New Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={passwordData.newPassword}
                  onChangeText={text => setPasswordData(prev => ({ ...prev, newPassword: text }))}
                  placeholder="Enter new password"
                  secureTextEntry={!passwordVisible.new}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => togglePasswordVisibility('new')}
                >
                  <Icon name={passwordVisible.new ? 'eye-off' : 'eye'} size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Confirm New Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={passwordData.confirmPassword}
                  onChangeText={text => setPasswordData(prev => ({ ...prev, confirmPassword: text }))}
                  placeholder="Confirm new password"
                  secureTextEntry={!passwordVisible.confirm}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => togglePasswordVisibility('confirm')}
                >
                  <Icon name={passwordVisible.confirm ? 'eye-off' : 'eye'} size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handlePasswordChange}
              disabled={saving}
            >
              <Text style={styles.buttonText}>{saving ? 'Updating...' : 'Update Password'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Billing Confirmation Modal */}
      <Modal visible={showBillingModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Billing Update</Text>
            <Text style={styles.modalDescription}>
              Enter your password to confirm billing information changes
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={billingPassword}
                  onChangeText={setBillingPassword}
                  placeholder="Enter your password"
                  secureTextEntry={!passwordVisible.billing}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => togglePasswordVisibility('billing')}
                >
                  <Icon name={passwordVisible.billing ? 'eye-off' : 'eye'} size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButtonOutline}
                onPress={() => {
                  setShowBillingModal(false);
                  setBillingPassword('');
                }}
              >
                <Text style={styles.modalButtonOutlineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, (saving || !billingPassword) && styles.buttonDisabled]}
                onPress={handleBillingSave}
                disabled={saving || !billingPassword}
              >
                <Text style={styles.modalButtonText}>{saving ? 'Updating...' : 'Confirm Update'}</Text>
              </TouchableOpacity>
            </View>
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
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
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
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
  kycLink: {
    fontSize: 14,
    color: '#1e3a8a',
    fontWeight: '500',
  },
  tabsScroll: {
    maxHeight: 50,
    backgroundColor: '#ffffff',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
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
  },
  content: {
    flex: 1,
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
    marginBottom: 8,
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
  inputDisabled: {
    backgroundColor: '#e2e8f0',
    color: '#64748b',
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  passwordToggle: {
    padding: 14,
  },
  button: {
    backgroundColor: '#1e3a8a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logoPreview: {
    width: 64,
    height: 64,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  logoImage: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
  },
  logoInfo: {
    flex: 1,
  },
  logoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  logoDescription: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  removeButton: {
    padding: 8,
  },
  uploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 8,
  },
  uploadDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  uploadHint: {
    fontSize: 12,
    color: '#94a3b8',
  },
  logoActions: {
    marginTop: 12,
  },
  replaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  replaceButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e3a8a',
  },
  previewBox: {
    padding: 20,
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewLogo: {
    width: 48,
    height: 48,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  previewLogoImage: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  previewSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e3a8a',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: width - 48,
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButtonOutline: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  modalButtonOutlineText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});