import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

const backgroundImages = [
  require('../../assets/images/hotel1.jpg'),
  require('../../assets/images/hotel2.jpg'),
  require('../../assets/images/hotel3.jpg'),
  require('../../assets/images/hotel4.jpg'),
  require('../../assets/images/hotel5.jpg'),
];

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Background slideshow effect
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setCurrentImageIndex((prevIndex) => (prevIndex + 1) % backgroundImages.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('hotel_owners')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        const userProfile = await fetchUserProfile(data.user.id);

        if (userProfile) {
          await AsyncStorage.setItem('userProfile', JSON.stringify(userProfile));
          await AsyncStorage.setItem('isLoggedIn', 'true');
        } else {
          await AsyncStorage.setItem('isLoggedIn', 'true');
          await AsyncStorage.setItem('profileSetupRequired', 'true');
        }

        await AsyncStorage.setItem('userId', data.user.id);
        await AsyncStorage.setItem('userEmail', data.user.email || '');

        await login(userProfile || data.user);

        Toast.show({
          type: 'success',
          text1: 'Login Successful!',
          text2: 'Welcome back to WriteMyTrip',
        });
      }
    } catch (error: any) {
      console.error('Login error:', error);

      let errorMessage = 'An error occurred during login';

      if (error.message?.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password';
      } else if (error.message?.includes('Email not confirmed')) {
        errorMessage = 'Please check your email and confirm your account';
      } else if (error.message?.includes('Too many requests')) {
        errorMessage = 'Too many login attempts. Please try again later';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setErrors({ general: errorMessage });
      Toast.show({
        type: 'error',
        text1: 'Login Failed',
        text2: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    Toast.show({
      type: 'info',
      text1: 'Coming Soon',
      text2: 'Google Sign-In will be available soon',
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Animated.View style={[styles.backgroundContainer, { opacity: fadeAnim }]}>
        <ImageBackground
          source={backgroundImages[currentImageIndex]}
          style={styles.backgroundImage}
          resizeMode="cover"
        >
          <View style={styles.overlay} />
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,58,143,0.2)']}
            style={styles.gradientOverlay}
          />
        </ImageBackground>
      </Animated.View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logoWrapper}>
              <Image
                source={require('../../assets/images/LOGO1.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
          </View>
          <Text style={styles.headerTitle}>Welcome Back</Text>
          <Text style={styles.headerSubtitle}>
            Sign in to manage your hospitality business
          </Text>
        </View>

        {/* Login Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Sign In to WriteMyTrip</Text>
            <Text style={styles.cardDescription}>
              Access your hotel management dashboard
            </Text>
          </View>

          <View style={styles.cardContent}>
            {/* General Error */}
            {errors.general && (
              <View style={styles.alertError}>
                <Ionicons name="alert-circle" size={20} color="#FF3B30" />
                <Text style={styles.alertText}>{errors.general}</Text>
              </View>
            )}

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWithIcon}>
                <Ionicons name="mail-outline" size={18} color="#999" style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    styles.inputWithIconPadding,
                    errors.email && styles.inputError,
                  ]}
                  value={formData.email}
                  onChangeText={(text) => handleInputChange('email', text)}
                  placeholder="Enter your email"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!isLoading}
                />
              </View>
              {errors.email && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={14} color="#FF3B30" />
                  <Text style={styles.errorText}>{errors.email}</Text>
                </View>
              )}
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWithIcon}>
                <Ionicons name="lock-closed-outline" size={18} color="#999" style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    styles.inputWithIconPadding,
                    errors.password && styles.inputError,
                  ]}
                  value={formData.password}
                  onChangeText={(text) => handleInputChange('password', text)}
                  placeholder="Enter your password"
                  placeholderTextColor="#999"
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#999"
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={14} color="#FF3B30" />
                  <Text style={styles.errorText}>{errors.password}</Text>
                </View>
              )}
            </View>

            {/* Forgot Password */}
            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={() =>router.replace('(auth)/forgot-password') }
            >
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#007AFF', '#0051D5']}
                style={styles.gradientButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isLoading ? (
                  <View style={styles.buttonContent}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.buttonText}>Signing in...</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Separator */}
            {/* <View style={styles.separator}>
              <View style={styles.separatorLine} />
              <Text style={styles.separatorText}>OR</Text>
              <View style={styles.separatorLine} />
            </View> */}

            {/* Google Sign In */}
            {/* <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-google" size={20} color="#DB4437" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity> */}

            {/* Sign Up Link */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text style={styles.linkText}>Sign up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Footer Info */}
        <View style={styles.bottomFooter}>
          <Text style={styles.bottomFooterText}>
            Secure login powered by advanced encryption
          </Text>
          <View style={styles.bottomLinks}>
            <Text style={styles.bottomLinkText}>Privacy Policy</Text>
            <Text style={styles.bottomLinkSeparator}>•</Text>
            <Text style={styles.bottomLinkText}>Terms of Service</Text>
            <Text style={styles.bottomLinkSeparator}>•</Text>
            <Text style={styles.bottomLinkText}>Help Center</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Styles remain the same as previous version
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  backgroundContainer: { ...StyleSheet.absoluteFillObject },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  gradientOverlay: { ...StyleSheet.absoluteFillObject },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 40, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 30 },
  logoContainer: { width: 80, height: 80, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  logoWrapper: { width: 48, height: 48, backgroundColor: '#fff', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  logo: { width: 32, height: 32 },
  headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 8, textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10 },
  headerSubtitle: { fontSize: 16, color: '#E5E5EA', textAlign: 'center', textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 5 },
  card: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  cardHeader: { padding: 20, alignItems: 'center' },
  cardTitle: { fontSize: 22, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 8 },
  cardDescription: { fontSize: 14, color: '#8E8E93', textAlign: 'center' },
  cardContent: { padding: 24 },
  alertError: { flexDirection: 'row', backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FCA5A5' },
  alertText: { flex: 1, fontSize: 14, color: '#991B1B', marginLeft: 8 },
  inputContainer: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#3A3A3C', marginBottom: 8 },
  input: { height: 48, borderWidth: 1, borderColor: '#C6C6C8', borderRadius: 10, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#000' },
  inputError: { borderColor: '#FF3B30' },
  inputWithIcon: { position: 'relative' },
  inputWithIconPadding: { paddingLeft: 45, paddingRight: 45 },
  inputIcon: { position: 'absolute', left: 15, top: 15, zIndex: 1 },
  eyeIcon: { position: 'absolute', right: 15, top: 14, padding: 5 },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  errorText: { fontSize: 12, color: '#FF3B30', marginLeft: 4 },
  forgotPassword: { alignSelf: 'flex-end', marginBottom: 16 },
  forgotPasswordText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  submitButton: { marginBottom: 16, borderRadius: 10, overflow: 'hidden' },
  submitButtonDisabled: { opacity: 0.6 },
  gradientButton: { height: 48, justifyContent: 'center', alignItems: 'center' },
  buttonContent: { flexDirection: 'row', alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  separator: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#E5E5EA' },
  separatorText: { fontSize: 14, color: '#8E8E93', marginHorizontal: 12 },
  googleButton: { flexDirection: 'row', height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#E5E5EA', backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  googleButtonText: { fontSize: 16, color: '#1C1C1E', fontWeight: '500', marginLeft: 10 },
  footer: { flexDirection: 'row', justifyContent: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E5EA' },
  footerText: { fontSize: 14, color: '#8E8E93' },
  linkText: { fontSize: 14, color: '#007AFF', fontWeight: '600' },
  bottomFooter: { alignItems: 'center', marginTop: 24 },
  bottomFooterText: { fontSize: 12, color: '#E5E5EA', marginBottom: 8 },
  bottomLinks: { flexDirection: 'row', alignItems: 'center' },
  bottomLinkText: { fontSize: 11, color: '#C7C7CC' },
  bottomLinkSeparator: { fontSize: 11, color: '#C7C7CC', marginHorizontal: 8 },
});