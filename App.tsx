import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeartbeat } from './src/hooks/useHeartbeat';
import { useSendWorker } from './src/hooks/useSendWorker';
import { SmsNative } from './src/native/SmsNative';
import { registerGateway, loadRegistration } from './src/register';
import DashboardScreen from './src/screens/DashboardScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SetupScreen from './src/screens/SetupScreen';
import {
  clearAll,
  clearToken,
  loadLog,
  loadSendingEnabled,
  saveLog,
  saveSendingEnabled,
} from './src/storage/storage';
import type {
  DeviceInfo,
  GatewayConfig,
  HeartbeatState,
  LogEntry,
  RegisteredGateway,
} from './src/types';

type Screen = 'home' | 'settings';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const [hydrated, setHydrated] = useState(false);
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [sendingEnabled, setSendingEnabled] = useState(false);
  const [needsReregister, setNeedsReregister] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [heartbeat, setHeartbeat] = useState<HeartbeatState>({
    lastAt: null,
    status: null,
    error: null,
  });

  useEffect(() => {
    (async () => {
      const [registration, savedLog, savedSending] = await Promise.all([
        loadRegistration(),
        loadLog(),
        loadSendingEnabled(),
      ]);
      if (registration) {
        setConfig({
          serverUrl: registration.serverUrl,
          deviceId: registration.deviceId,
          gatewayId: registration.gatewayId,
          name: registration.name,
          phoneNumber: registration.phoneNumber,
        });
        setToken(registration.token);
      }
      setLog(savedLog);
      setSendingEnabled(savedSending);
      setHydrated(true);
    })();
  }, []);

  const registration: RegisteredGateway | null = useMemo(() => {
    if (!config || !token) {
      return null;
    }
    return { ...config, token };
  }, [config, token]);

  const onLog = useCallback((entry: LogEntry): void => {
    setLog(prev => {
      const next = [...prev, entry];
      const trimmed = next.length > 50 ? next.slice(next.length - 50) : next;
      saveLog(trimmed).catch(() => {
        // log persistence is best effort
      });
      return trimmed;
    });
  }, []);

  const onUnauthorized = useCallback((): void => {
    setNeedsReregister(true);
    setSendingEnabled(false);
    saveSendingEnabled(false).catch(() => {
      // ignore
    });
  }, []);

  useHeartbeat({
    registration,
    enabled: !!registration && !needsReregister,
    onLog,
    onDeviceInfo: setDeviceInfo,
    onHeartbeat: setHeartbeat,
    onUnauthorized,
  });

  useSendWorker({
    registration,
    enabled: !!registration && sendingEnabled && !needsReregister,
    onLog,
    onUnauthorized,
  });

  const handleRegistered = useCallback((r: RegisteredGateway): void => {
    setConfig({
      serverUrl: r.serverUrl,
      deviceId: r.deviceId,
      gatewayId: r.gatewayId,
      name: r.name,
      phoneNumber: r.phoneNumber,
    });
    setToken(r.token);
    setNeedsReregister(false);
    setSendingEnabled(false);
    setScreen('home');
    saveSendingEnabled(false).catch(() => {
      // ignore
    });
  }, []);

  const handleReRegister = useCallback(async (): Promise<void> => {
    if (!config) {
      return;
    }
    try {
      onLog({ t: Date.now(), kind: 'system', result: 'REREGISTERING' });
      const { config: nextConfig, token: nextToken } = await registerGateway({
        serverUrl: config.serverUrl,
        name: config.name,
        phoneNumber: config.phoneNumber,
      });
      setConfig(nextConfig);
      setToken(nextToken);
      setNeedsReregister(false);
      onLog({ t: Date.now(), kind: 'system', result: 'REREGISTERED' });
    } catch (error) {
      onLog({
        t: Date.now(),
        kind: 'system',
        result: 'REREGISTER_FAILED',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }, [config, onLog]);

  const handleToggleSending = useCallback((enabled: boolean): void => {
    setSendingEnabled(enabled);
    saveSendingEnabled(enabled).catch(() => {
      // ignore
    });
  }, []);

  const handleRefreshDeviceInfo = useCallback((): void => {
    SmsNative.getDeviceInfo()
      .then(info => setDeviceInfo(info))
      .catch(() => {
        // ignore
      });
  }, []);

  const handleClearToken = useCallback((): void => {
    clearToken().catch(() => {
      // ignore
    });
    setToken(null);
    setNeedsReregister(false);
  }, []);

  const handleUnregister = useCallback((): void => {
    clearAll().catch(() => {
      // ignore
    });
    setConfig(null);
    setToken(null);
    setSendingEnabled(false);
    setNeedsReregister(false);
    setLog([]);
    setDeviceInfo(null);
    setHeartbeat({ lastAt: null, status: null, error: null });
  }, []);

  if (!hydrated) {
    return (
      <View style={[styles.container, isDarkMode ? styles.backgroundDark : styles.backgroundLight]} />
    );
  }

  if (!registration) {
    return (
      <View style={[styles.container, isDarkMode ? styles.backgroundDark : styles.backgroundLight]}>
        <SetupScreen
          initialConfig={config}
          onRegistered={handleRegistered}
          onLog={onLog}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, isDarkMode ? styles.backgroundDark : styles.backgroundLight]}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Text style={styles.headerTitle}>SMS Gateway</Text>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, screen === 'home' && styles.tabActive]}
              onPress={() => setScreen('home')}
            >
              <Text style={[styles.tabText, screen === 'home' && styles.tabTextActive]}>
                Home
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, screen === 'settings' && styles.tabActive]}
              onPress={() => setScreen('settings')}
            >
              <Text style={[styles.tabText, screen === 'settings' && styles.tabTextActive]}>
                Settings
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {screen === 'home' ? (
          <DashboardScreen
            registration={registration}
            sending={sendingEnabled}
            needsReregister={needsReregister}
            deviceInfo={deviceInfo}
            heartbeat={heartbeat}
            log={log}
            onToggleSending={handleToggleSending}
            onReRegister={handleReRegister}
            onRefreshDeviceInfo={handleRefreshDeviceInfo}
          />
        ) : (
          <SettingsScreen
            registration={registration}
            onSaved={handleRegistered}
            onClearToken={handleClearToken}
            onUnregister={handleUnregister}
            onLog={onLog}
          />
        )}
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundDark: {
    backgroundColor: '#111',
  },
  backgroundLight: {
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#161616',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomColor: '#222',
    borderBottomWidth: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  tabs: {
    flexDirection: 'row',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  tabActive: {
    backgroundColor: '#2f6feb',
  },
  tabText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
});

export default App;