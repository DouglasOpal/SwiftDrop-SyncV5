// src/navigation/AppNavigator.js — auth-aware root navigation
import React from 'react';
import { View, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';
import { colors, font } from '../theme';
import { Loader } from '../components/ui';

// Auth
import RoleSelectScreen from '../screens/auth/RoleSelectScreen';
import UserAuthScreen   from '../screens/auth/UserAuthScreen';
import RiderAuthScreen  from '../screens/auth/RiderAuthScreen';
import AdminLoginScreen from '../screens/auth/AdminLoginScreen';
// User
import UserHomeScreen      from '../screens/user/UserHomeScreen';
import LocationPickerScreen from '../screens/user/LocationPickerScreen';
import CreateDeliveryScreen from '../screens/user/CreateDeliveryScreen';
import FindingRiderScreen   from '../screens/user/FindingRiderScreen';
import TrackingScreen       from '../screens/user/TrackingScreen';
import HistoryScreen        from '../screens/user/HistoryScreen';
import UserProfileScreen    from '../screens/user/UserProfileScreen';
// Rider
import RiderHomeScreen     from '../screens/rider/RiderHomeScreen';
import AvailableJobsScreen from '../screens/rider/AvailableJobsScreen';
import ActiveDeliveryScreen from '../screens/rider/ActiveDeliveryScreen';
import EarningsScreen      from '../screens/rider/EarningsScreen';
import BankDetailsScreen   from '../screens/rider/BankDetailsScreen';
import RiderProfileScreen  from '../screens/rider/RiderProfileScreen';
// Admin
import AdminHomeScreen     from '../screens/admin/AdminHomeScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary } };
const stackOpts = { headerStyle: { backgroundColor: colors.surface }, headerTitleStyle: { fontFamily: font.semi, color: colors.text }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } };

function TabIcon({ glyph, focused }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>;
}
const tabOpts = (glyph) => ({
  tabBarIcon: ({ focused }) => <TabIcon glyph={glyph} focused={focused} />,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textDim,
  tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 60, paddingBottom: 8, paddingTop: 6 },
  tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
  headerStyle: { backgroundColor: colors.surface },
  headerTitleStyle: { fontFamily: font.semi, color: colors.text },
  headerTintColor: colors.text,
});

// ── Auth flow ──
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={stackOpts}>
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UserAuth"  component={UserAuthScreen}  options={{ title: 'Sign in' }} />
      <Stack.Screen name="RiderAuth" component={RiderAuthScreen} options={{ title: 'Become a rider' }} />
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} options={{ title: 'Admin' }} />
    </Stack.Navigator>
  );
}

// ── User tabs + stacks ──
function UserTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Send"    component={UserHomeStack} options={{ ...tabOpts('📦'), headerShown: false }} />
      <Tab.Screen name="Orders"  component={HistoryScreen} options={tabOpts('🧾')} />
      <Tab.Screen name="Profile" component={UserProfileScreen} options={tabOpts('👤')} />
    </Tab.Navigator>
  );
}
function UserHomeStack() {
  return (
    <Stack.Navigator screenOptions={stackOpts}>
      <Stack.Screen name="UserHome" component={UserHomeScreen} options={{ title: 'SwiftDrop' }} />
      <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ title: 'Choose location' }} />
      <Stack.Screen name="CreateDelivery" component={CreateDeliveryScreen} options={{ title: 'New delivery' }} />
      <Stack.Screen name="FindingRider" component={FindingRiderScreen} options={{ title: 'Finding rider', headerBackVisible: false }} />
      <Stack.Screen name="Tracking" component={TrackingScreen} options={{ title: 'Track delivery' }} />
    </Stack.Navigator>
  );
}

// ── Rider tabs + stacks (feature 7: navigation across all rider screens) ──
function RiderTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Dashboard" component={RiderHomeStack} options={{ ...tabOpts('🛵'), headerShown: false }} />
      <Tab.Screen name="Jobs"      component={AvailableJobsScreen} options={tabOpts('📍')} />
      <Tab.Screen name="Earnings"  component={EarningsScreen} options={tabOpts('💰')} />
      <Tab.Screen name="Account"   component={RiderAccountStack} options={{ ...tabOpts('👤'), headerShown: false }} />
    </Tab.Navigator>
  );
}
function RiderHomeStack() {
  return (
    <Stack.Navigator screenOptions={stackOpts}>
      <Stack.Screen name="RiderHome" component={RiderHomeScreen} options={{ title: 'Dashboard' }} />
      <Stack.Screen name="ActiveDelivery" component={ActiveDeliveryScreen} options={{ title: 'Active delivery' }} />
    </Stack.Navigator>
  );
}
function RiderAccountStack() {
  return (
    <Stack.Navigator screenOptions={stackOpts}>
      <Stack.Screen name="RiderProfile" component={RiderProfileScreen} options={{ title: 'Account' }} />
      <Stack.Screen name="BankDetails" component={BankDetailsScreen} options={{ title: 'Bank details' }} />
    </Stack.Navigator>
  );
}

export default function AppNavigator({ onReady }) {
  const { booting, type } = useAuth();

  return (
    <NavigationContainer theme={navTheme} onReady={onReady}>
      {booting ? (
        <View style={{ flex: 1, backgroundColor: colors.bg }}><Loader label="Loading SwiftDrop…" /></View>
      ) : !type ? (
        <AuthStack />
      ) : type === 'user' ? (
        <UserTabs />
      ) : type === 'rider' ? (
        <RiderTabs />
      ) : (
        <Stack.Navigator screenOptions={stackOpts}>
          <Stack.Screen name="AdminHome" component={AdminHomeScreen} options={{ title: 'Admin' }} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
