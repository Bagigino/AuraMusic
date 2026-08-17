import { DarkTheme, Tabs, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';

import { AudioPlayerProvider } from '@/audio/audio-player-context';
import { AuraColors } from '@/constants/aura-theme';
import { migrateDatabase } from '@/database/migrations';
import { TrackLibraryProvider } from '@/library/track-library-context';
import { appDownloadService } from '@/services/app-download-service';

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: AuraColors.primary,
    background: AuraColors.background,
    card: AuraColors.surface,
    text: AuraColors.text,
    border: AuraColors.border,
  },
};

type TabIconProps = {
  symbol: string;
  color: ColorValue;
  focused: boolean;
};

function TabIcon({ symbol, color, focused }: TabIconProps) {
  return (
    <View style={[styles.tabIcon, focused && styles.activeTabIcon]}>
      <Text style={[styles.tabIconText, { color }]}>{symbol}</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <SQLiteProvider databaseName="auramusic.db" onInit={migrateDatabase}>
        <TrackLibraryProvider downloadService={appDownloadService}>
          <AudioPlayerProvider>
            <StatusBar style="light" />
            <Tabs
              screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: AuraColors.primary,
                tabBarInactiveTintColor: AuraColors.textMuted,
                tabBarHideOnKeyboard: true,
                tabBarLabelStyle: styles.tabLabel,
                tabBarStyle: styles.tabBar,
              }}>
              <Tabs.Screen
                name="index"
                options={{
                  title: 'Library',
                  tabBarIcon: ({ color, focused }) => (
                    <TabIcon color={color} focused={focused} symbol="♫" />
                  ),
                }}
              />
              <Tabs.Screen
                name="player"
                options={{
                  title: 'Player',
                  tabBarIcon: ({ color, focused }) => (
                    <TabIcon color={color} focused={focused} symbol="▶" />
                  ),
                }}
              />
              <Tabs.Screen
                name="add-track"
                options={{
                  title: 'Add Track',
                  tabBarIcon: ({ color, focused }) => (
                    <TabIcon color={color} focused={focused} symbol="＋" />
                  ),
                }}
              />
            </Tabs>
          </AudioPlayerProvider>
        </TrackLibraryProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    paddingTop: 8,
    backgroundColor: '#10131C',
    borderTopColor: AuraColors.border,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  tabIcon: {
    width: 34,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  activeTabIcon: {
    backgroundColor: '#2B2144',
  },
  tabIconText: {
    fontSize: 17,
    fontWeight: '800',
  },
});
