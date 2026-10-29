import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SmsNative } from '../native/SmsNative';
import { registerGateway } from '../register';
import type { GatewayConfig, LogEntry, RegisteredGateway } from '../types';

const DEFAULT_SERVER_URL = 'http://10.0.2.2:3000';

interface SetupScreenProps {
  initialConfig: GatewayConfig | null;
  onRegistered: (registration: RegisteredGateway) => void;
  onLog: (entry: LogEntry) => void;
}

export default function SetupScreen({
  initialConfig,
  onRegistered,
  onLog,
}: SetupScreenProps): React.JSX.Element {
  const [serverUrl, setServerUrl] = useState(
    initialConfig?.serverUrl ?? DEFAULT_SERVER_URL,
  );
  const [name, setName] = useState(initialConfig?.name ?? '');
  const [phoneNumber, setPhoneNumber] = useState(initialConfig?.phoneNumber ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!name) {
      SmsNative.getDeviceMetadata()
        .then(meta => {
          if (meta.model) {
            setName(meta.model);
          }
        })
        .catch(() => {
          // keep empty name, user can set one manually
        });
    }
  }, [name]);

  const handleRegister = async (): Promise<void> => {
    const url = serverUrl.trim();
    const trimmedName = name.trim();
    if (!url) {
      Alert.alert('Server URL required', 'Enter the SMS Gateway backend URL.');
      return;
    }
    if (!trimmedName) {
      Alert.alert('Device name required', 'Enter a name for this gateway device.');
      return;
    }
    setBusy(true);
    try {
      onLog({
        t: Date.now(),
        kind: 'system',
        result: 'REGISTERING',
        detail: url,
      });
      const { config, token } = await registerGateway({
        serverUrl: url,
        name: trimmedName,
        phoneNumber: phoneNumber.trim() || undefined,
      });
      onLog({ t: Date.now(), kind: 'system', result: 'REGISTERED', detail: config.gatewayId });
      onRegistered({ ...config, token });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      onLog({ t: Date.now(), kind: 'system', result: 'REGISTER_FAILED', detail });
      Alert.alert('Registration failed', detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>SMS Gateway</Text>
        <Text style={styles.subtitle}>Turn this device into an SMS gateway</Text>

        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://10.0.2.2:3000"
          placeholderTextColor="#888"
        />

        <Text style={styles.label}>Device name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholder="My Gateway"
          placeholderTextColor="#888"
        />

        <Text style={styles.label}>Phone number (optional)</Text>
        <TextInput
          style={styles.input}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          placeholder="+15551234567"
          placeholderTextColor="#888"
        />

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {initialConfig ? 'Re-register device' : 'Register gateway'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 24,
    paddingTop: 64,
    justifyContent: 'center',
    alignContent: 'stretch',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 28,
  },
  label: {
    color: '#ddd',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#2f6feb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});