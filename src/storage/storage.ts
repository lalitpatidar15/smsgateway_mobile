import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GatewayConfig, LogEntry } from '../types';

const KEY_CONFIG = '@sms_gateway/config';
const KEY_TOKEN = '@sms_gateway/token';
const KEY_LOG = '@sms_gateway/log';
const KEY_SENDING = '@sms_gateway/sending';

export async function loadConfig(): Promise<GatewayConfig | null> {
  const raw = await AsyncStorage.getItem(KEY_CONFIG);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as GatewayConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: GatewayConfig): Promise<void> {
  await AsyncStorage.setItem(KEY_CONFIG, JSON.stringify(config));
}

export async function loadToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_TOKEN);
}

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEY_TOKEN, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(KEY_TOKEN);
}

export async function loadDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem('@sms_gateway/deviceId');
}

export async function saveDeviceId(deviceId: string): Promise<void> {
  await AsyncStorage.setItem('@sms_gateway/deviceId', deviceId);
}

export async function loadLog(): Promise<LogEntry[]> {
  const raw = await AsyncStorage.getItem(KEY_LOG);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as LogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveLog(log: LogEntry[]): Promise<void> {
  const trimmed = log.length > 50 ? log.slice(log.length - 50) : log;
  await AsyncStorage.setItem(KEY_LOG, JSON.stringify(trimmed));
}

export async function loadSendingEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY_SENDING);
  return raw === 'true';
}

export async function saveSendingEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY_SENDING, enabled ? 'true' : 'false');
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.removeMany([
    KEY_CONFIG,
    KEY_TOKEN,
    KEY_LOG,
    KEY_SENDING,
    '@sms_gateway/deviceId',
  ]);
}