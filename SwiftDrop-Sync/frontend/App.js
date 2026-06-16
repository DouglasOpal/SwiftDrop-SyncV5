// App.js — SwiftDrop root entry point
import React, { useCallback } from 'react';
import { LogBox, StatusBar } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Syne_400Regular,
  Syne_600SemiBold,
  Syne_700Bold,
  Syne_800ExtraBold,
} from '@expo-google-fonts/syne';
import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
} from '@expo-google-fonts/dm-sans';

import { AuthProvider } from './src/context/AuthContext';
import AppNavigator     from './src/navigation/AppNavigator';

SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs([
  'Non-serializable values were found',
  'VirtualizedLists should never be nested',
  'Require cycle:',
  'Warning: Each child',
]);

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'Syne-Regular':   Syne_400Regular,
    'Syne-SemiBold':  Syne_600SemiBold,
    'Syne-Bold':      Syne_700Bold,
    'Syne-ExtraBold': Syne_800ExtraBold,
    'DMSans-Light':   DMSans_300Light,
    'DMSans-Regular': DMSans_400Regular,
    'DMSans-Medium':  DMSans_500Medium,
  });

  const onReady = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <AuthProvider>
      <StatusBar translucent backgroundColor="transparent" />
      <AppNavigator onReady={onReady} />
    </AuthProvider>
  );
}
