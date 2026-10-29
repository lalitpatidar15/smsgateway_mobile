import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GatewayApi } from '../api/client';
import { SmsNative } from '../native/SmsNative';
import type {
  DeviceInfo,
  HeartbeatState,
  LogEntry,
  RegisteredGateway,
  Stats,
} from '../types';

const STATS_INTERVAL_MS = 10000;

interface DashboardScreenProps {
  registration: RegisteredGateway;
  sending: boolean;
  needsReregister: boolean;
  deviceInfo: DeviceInfo | null;
  heartbeat: HeartbeatState;
  log: LogEntry[];
  onToggleSending: (enabled: boolean) => void;
  onReRegister: () => void;
  onRefreshDeviceInfo: () => void;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString();
}

export default function DashboardScreen({
  registration,
  sending,
  needsReregister,
  deviceInfo,
  heartbeat,
  log,
  onToggleSending,
  onReRegister,
  onRefreshDeviceInfo,
}: DashboardScreenProps): React.JSX.Element {
  const [stats, setStats] = useState<Stats | null>(null);
  const [busyToggle, setBusyToggle] = useState(false);

  useEffect(() => {
    const api = new GatewayApi(registration.serverUrl, registration.token);
    let stopped = false;
    const load = async (): Promise<void> => {
      try {
        const next = await api.stats();
        if (!stopped) {
          setStats(next);
        }
      } catch {
        // stats are best effort
      }
    };
    load();
    const interval = setInterval(load, STATS_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [registration.serverUrl, registration.token]);

  const handleToggleSending = async (): Promise<void> => {
    const next = !sending;
    if (next) {
      setBusyToggle(true);
      try {
        const granted = await SmsNative.requestPermissions();
        if (!granted) {
          Alert.alert(
            'Permission needed',
            'SMS and phone state permissions are required to send messages.',
          );
          return;
        }
        onToggleSending(true);
      } finally {
        setBusyToggle(false);
      }
    } else {
      onToggleSending(false);
    }
  };

  const statsGrid = stats
    ? [
        { label: 'Pending', value: stats.pending, color: '#e8b84b' },
        { label: 'Sending', value: stats.processing, color: '#4b8de8' },
        { label: 'Sent', value: stats.sent, color: '#4be87a' },
        { label: 'Failed', value: stats.failed, color: '#e84b4b' },
      ]
    : [];

  const renderLog = (): React.JSX.Element => {
    if (log.length === 0) {
      return <Text style={styles.logEmpty}>No activity yet.</Text>;
    }
    return (
      <>
        {[...log]
          .reverse()
          .slice(0, 50)
          .map(entry => (
            <View key={`${entry.t}-${entry.messageId ?? entry.kind}`} style={styles.logRow}>
              <Text style={styles.logTime}>{formatTime(entry.t)}</Text>
              <Text style={styles.logText} numberOfLines={2}>
                <Text style={styles.logResult}>{entry.result}</Text>
                {entry.recipient ? ` → ${entry.recipient}` : ''}
                {entry.messageId ? ` #${entry.messageId.slice(0, 8)}` : ''}
                {entry.detail ? ` (${entry.detail})` : ''}
              </Text>
            </View>
          ))}
      </>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {needsReregister ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Gateway token was rejected by the server. Re-register to continue.
          </Text>
          <TouchableOpacity style={styles.bannerButton} onPress={onReRegister}>
            <Text style={styles.bannerButtonText}>Re-register now</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device</Text>
        <Text style={styles.cardValue}>{registration.name}</Text>
        <Text style={styles.cardMeta}>ID: {registration.gatewayId}</Text>
        <View style={styles.statusRow}>
          <View style={sending ? styles.statusDotOn : styles.statusDotOff} />
          <Text style={styles.cardMeta}>
            Sending {sending ? 'enabled' : 'disabled'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.toggleButton, sending ? styles.toggleButtonOn : styles.toggleButtonOff]}
          onPress={handleToggleSending}
          disabled={busyToggle}
        >
          {busyToggle ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.toggleButtonText}>
              {sending ? 'Stop sending' : 'Start sending'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connection</Text>
        <View style={styles.row}>
          <Text style={styles.metaLabel}>Server:</Text>
          <Text style={styles.metaValue}>{registration.serverUrl}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.metaLabel}>Status:</Text>
          <Text style={styles.metaValue}>
            {heartbeat.status ?? (heartbeat.error ? 'offline' : 'connecting…')}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.metaLabel}>Last heartbeat:</Text>
          <Text style={styles.metaValue}>
            {heartbeat.lastAt ? formatTime(heartbeat.lastAt) : 'never'}
          </Text>
        </View>
        {heartbeat.error ? (
          <Text style={styles.errorText}>{heartbeat.error}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Device status</Text>
          <TouchableOpacity onPress={onRefreshDeviceInfo}>
            <Text style={styles.link}>Refresh</Text>
          </TouchableOpacity>
        </View>
        {deviceInfo ? (
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridValue}>{deviceInfo.battery}%</Text>
              <Text style={styles.gridLabel}>
                Battery{deviceInfo.charging ? ' (charging)' : ''}
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridValue}>{deviceInfo.network}</Text>
              <Text style={styles.gridLabel}>Network</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridValue}>
                {deviceInfo.signalStrength >= 0 ? deviceInfo.signalStrength : '—'}
              </Text>
              <Text style={styles.gridLabel}>Signal</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridValue}>{deviceInfo.simCount}</Text>
              <Text style={styles.gridLabel}>SIMs</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.logEmpty}>Waiting for device info…</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Stats</Text>
        {stats ? (
          <View style={styles.grid}>
            {statsGrid.map(item => (
              <View key={item.label} style={styles.gridItem}>
                <Text style={[styles.gridValue, { color: item.color }]}>{item.value}</Text>
                <Text style={styles.gridLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.logEmpty}>Loading stats…</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Activity log</Text>
        <View style={styles.log}>{renderLog()}</View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  banner: {
    backgroundColor: '#5a4a12',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: {
    color: '#f0d070',
    fontSize: 13,
    marginBottom: 8,
  },
  bannerButton: {
    backgroundColor: '#e8b84b',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  bannerButtonText: {
    color: '#111',
    fontWeight: '600',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#1b1b1b',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  cardMeta: {
    color: '#999',
    fontSize: 12,
    marginBottom: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statusDotOn: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
    backgroundColor: '#4be87a',
  },
  statusDotOff: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
    backgroundColor: '#888',
  },
  toggleButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  toggleButtonOn: {
    backgroundColor: '#c0392b',
  },
  toggleButtonOff: {
    backgroundColor: '#27ae60',
  },
  toggleButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  metaLabel: {
    color: '#999',
    fontSize: 13,
    width: 110,
  },
  metaValue: {
    color: '#eee',
    fontSize: 13,
    flex: 1,
  },
  errorText: {
    color: '#e86a6a',
    fontSize: 12,
    marginTop: 4,
  },
  link: {
    color: '#5a8ff0',
    fontSize: 13,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '48%',
    backgroundColor: '#262626',
    borderRadius: 8,
    padding: 10,
    marginRight: '2%',
    marginBottom: 8,
  },
  gridValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  gridLabel: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
  },
  log: {
    backgroundColor: '#0d0d0d',
    borderRadius: 8,
    padding: 10,
  },
  logEmpty: {
    color: '#777',
    fontSize: 13,
    paddingVertical: 6,
  },
  logRow: {
    paddingVertical: 4,
    borderBottomColor: '#181818',
    borderBottomWidth: 1,
  },
  logTime: {
    color: '#666',
    fontSize: 11,
  },
  logText: {
    color: '#ccc',
    fontSize: 13,
  },
  logResult: {
    color: '#8ab4f8',
    fontWeight: '600',
  },
});