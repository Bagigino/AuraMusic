import { DarkTheme, Tabs, ThemeProvider, usePathname } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AudioPlayerProvider } from '@/audio/audio-player-context';
import { MiniPlayer } from '@/components/mini-player';
import { getTabBarHeight } from '@/components/player-layout-metrics';
import { AuraColors } from '@/constants/aura-theme';
import { migrateDatabase } from '@/database/migrations';
import { PlaylistProvider } from '@/library/playlist-context';
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
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isFullPlayerRoute = pathname === '/player';

  return (
    <ThemeProvider value={navigationTheme}>
      <SQLiteProvider databaseName="auramusic.db" onInit={migrateDatabase}>
        <TrackLibraryProvider downloadService={appDownloadService}>
          <PlaylistProvider>
            <AudioPlayerProvider>
              <View style={styles.app}>
                <StatusBar style="light" />
                <Tabs
                  screenOptions={{
                    headerShown: false,
                    tabBarActiveTintColor: AuraColors.primary,
                    tabBarInactiveTintColor: AuraColors.textMuted,
                    tabBarHideOnKeyboard: true,
                    tabBarLabelStyle: styles.tabLabel,
                    tabBarStyle: isFullPlayerRoute
                      ? styles.hiddenTabBar
                      : [
                          styles.tabBar,
                          {
                            height: getTabBarHeight(insets.bottom),
                            paddingBottom: Math.max(insets.bottom, 8),
                          },
                        ],
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
                    name="search"
                    options={{
                      title: 'Search',
                      tabBarIcon: ({ color, focused }) => (
                        <TabIcon color={color} focused={focused} symbol="⌕" />
                      ),
                    }}
                  />
                  <Tabs.Screen name="player" options={{ href: null }} />
                  <Tabs.Screen
                    name="settings"
                    options={{
                      title: 'Settings',
                      tabBarIcon: ({ color, focused }) => (
                        <TabIcon color={color} focused={focused} symbol="⚙" />
                      ),
                    }}
                  />
                  <Tabs.Screen name="add-track" options={{ href: null }} />
                  <Tabs.Screen name="all-songs" options={{ href: null }} />
                  <Tabs.Screen name="playlist" options={{ href: null }} />
                </Tabs>
                <MiniPlayer />
              </View>
            </AudioPlayerProvider>
          </PlaylistProvider>
        </TrackLibraryProvider>
      </SQLiteProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  tabBar: {
    paddingTop: 8,
    backgroundColor: '#10131C',
    borderTopColor: AuraColors.border,
  },
  hiddenTabBar: { display: 'none' },
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
