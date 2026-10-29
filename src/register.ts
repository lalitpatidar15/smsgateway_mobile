import { GatewayApi } from './api/client';
import { SmsNative } from './native/SmsNative';
import {
  loadConfig,
  loadDeviceId,
  loadToken,
  saveConfig,
  saveDeviceId,
  saveToken,
} from './storage/storage';
import type { GatewayConfig, RegisteredGateway } from './types';

export function generateDeviceIdFallback(): string {
  const random = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0');
  return `${random()}${random()}-${random()}-${random()}-${random()}-${random()}${random()}${random()}`;
}

export async function resolveDeviceId(): Promise<string> {
  const persisted = await loadDeviceId();
  if (persisted && persisted.length > 0) {
    return persisted;
  }
  const androidId = await SmsNative.getAndroidId();
  if (androidId) {
    await saveDeviceId(androidId);
    return androidId;
  }
  const fallback = generateDeviceIdFallback();
  await saveDeviceId(fallback);
  return fallback;
}

export async function loadRegistration(): Promise<RegisteredGateway | null> {
  const [config, token] = await Promise.all([loadConfig(), loadToken()]);
  if (!config || !token) {
    return null;
  }
  return { ...config, token };
}

export async function registerGateway(input: {
  serverUrl: string;
  name: string;
  phoneNumber?: string;
}): Promise<{ config: GatewayConfig; token: string }> {
  const deviceId = await resolveDeviceId();
  const metadata = await SmsNative.getDeviceMetadata();
  const api = new GatewayApi(input.serverUrl, '');
  const response = await api.register({
    deviceId,
    name: input.name,
    phoneNumber: input.phoneNumber || undefined,
    platform: metadata.platform,
    appVersion: metadata.appVersion,
    manufacturer: metadata.manufacturer,
    model: metadata.model,
    androidVersion: metadata.androidVersion,
  });
  const config: GatewayConfig = {
    serverUrl: input.serverUrl,
    deviceId,
    gatewayId: response.id,
    name: response.name || input.name,
    phoneNumber: input.phoneNumber || undefined,
  };
  await saveConfig(config);
  await saveToken(response.token);
  return { config, token: response.token };
}

export async function persistRegistrationChanges(config: GatewayConfig): Promise<void> {
  await saveConfig(config);
}