import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SmsNative } from '../native/SmsNative';
import { registerGateway } from '../register';
import type { LogEntry, RegisteredGateway } from '../types';

interface SettingsScreenProps {
  registration: RegisteredGateway;
  onSaved: (registration: RegisteredGateway) => void;
  onClearToken: () => void;
  onUnregister: () => void;
  onLog: (entry: LogEntry) => void;
}

export default function SettingsScreen({
  registration,
  onSaved,
  onClearToken,
  onUnregister,
  onLog,
}: SettingsScreenProps): React.JSX.Element {
  const [serverUrl, setServerUrl] = useState(registration.serverUrl);
  const [name, setName] = useState(registration.name);
  const [phoneNumber, setPhoneNumber] = useState(registration.phoneNumber ?? '');
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    SmsNative.getDeviceMetadata()
      .then(meta => setAppVersion(meta.appVersion))
      .catch(() => {
        // ignore
      });
  }, []);

  const handleSave = async (): Promise<void> => {
    const url = serverUrl.trim();
    const trimmedName = name.trim();
    if (!url || !trimmedName) {
      Alert.alert('Invalid input', 'Server URL and device name are required.');
      return;
    }
    setBusy(true);
    try {
      onLog({ t: Date.now(), kind: 'system', result: 'REREGISTERING', detail: url });
      const { config, token } = await registerGateway({
        serverUrl: url,
        name: trimmedName,
        phoneNumber: phoneNumber.trim() || undefined,
      });
      onLog({ t: Date.now(), kind: 'system', result: 'REREGISTERED' });
      onSaved({ ...config, token });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      onLog({ t: Date.now(), kind: 'system', result: 'REREGISTER_FAILED', detail });
      Alert.alert('Re-register failed', detail);
    } finally {
      setBusy(false);
    }
  };

  const maskedToken = registration.token
    ? `${registration.token.slice(0, 6)}…${registration.token.slice(-4)}`
    : '—';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Gateway settings</Text>

        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholderTextColor="#888"
        />

        <Text style={styles.label}>Device name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholderTextColor="#888"
        />

        <Text style={styles.label}>Phone number (optional)</Text>
        <TextInput
          style={styles.input}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          placeholderTextColor="#888"
        />

        <TouchableOpacity
          style={[styles.button, styles.primaryButton, busy && styles.disabled]}
          onPress={handleSave}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Save & re-register</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.hint}>
          Changing the server URL or name rotates the token via server re-registration.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Token</Text>
        <View style={styles.row}>
          <Text style={styles.metaLabel}>Gateway ID:</Text>
          <Text style={styles.metaValue}>{registration.gatewayId}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.metaLabel}>Token:</Text>
          <Text style={styles.metaValue} selectable>
            {showToken ? registration.token : maskedToken}
          </Text>
        </View>
        <TouchableOpacity style={styles.linkButton} onPress={() => setShowToken(v => !v)}>
          <Text style={styles.link}>{showToken ? 'Hide token' : 'Show token'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.dangerOutline]}
          onPress={onClearToken}
        >
          <Text style={styles.dangerText}>Clear stored token</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Clearing the token logs out this gateway and requires re-registration.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Danger zone</Text>
        <TouchableOpacity
          style={[styles.button, styles.dangerButton]}
          onPress={() => {
            Alert.alert(
              'Unregister gateway?',
              'All local configuration and send logs will be deleted.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Unregister', style: 'destructive', onPress: onUnregister },
              ],
            );
          }}
        >
          <Text style={styles.buttonText}>Unregister gateway</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>App version {appVersion || '…'}</Text>
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
  card: {
    backgroundColor: '#1b1b1b',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  label: {
    color: '#ddd',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#262626',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryButton: {
    backgroundColor: '#2f6feb',
  },
  dangerButton: {
    backgroundColor: '#c0392b',
  },
  dangerOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#c0392b',
  },
  disabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  dangerText: {
    color: '#ff7a6b',
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  metaLabel: {
    color: '#999',
    fontSize: 13,
    width: 90,
  },
  metaValue: {
    color: '#eee',
    fontSize: 13,
    flex: 1,
  },
  linkButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  link: {
    color: '#5a8ff0',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});