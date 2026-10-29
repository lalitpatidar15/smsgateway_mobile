export type PlatformName = 'android' | 'ios';

export interface SimInfo {
  slotIndex: number;
  phoneNumber: string;
  carrierName: string | null;
  subscriptionId: number | null;
}

export interface DeviceInfo {
  battery: number;
  charging: boolean;
  network: string;
  signalStrength: number;
  simCount: number;
  sims: SimInfo[];
}

export interface DeviceMetadata {
  platform: PlatformName;
  manufacturer: string;
  model: string;
  androidVersion: string;
  appVersion: string;
}

export interface SendResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface GatewayConfig {
  serverUrl: string;
  deviceId: string;
  gatewayId: string;
  name: string;
  phoneNumber?: string;
}

export interface RegisteredGateway extends GatewayConfig {
  token: string;
}

export interface GatewayRegisterResponse {
  id: string;
  token: string;
  name: string;
  status: string;
}

export interface SmsJob {
  id: string;
  recipient: string;
  message: string;
  status: string;
  priority?: number;
  attemptCount?: number;
  maxAttempts?: number;
  scheduledAt?: string;
  segmentCount?: number;
  encoding?: string;
  [key: string]: unknown;
}

export type JobStatus =
  | 'QUEUED'
  | 'CLAIMED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED';

export type GatewayHeartbeatStatus =
  | 'ACTIVE'
  | 'DEGRADED'
  | 'OFFLINE'
  | string;

export interface Stats {
  pending: number;
  sent: number;
  failed: number;
  processing: number;
}

export type LogKind = 'send' | 'heartbeat' | 'system';

export interface LogEntry {
  t: number;
  kind: LogKind;
  messageId?: string;
  recipient?: string;
  result: string;
  detail?: string;
}

export interface HeartbeatState {
  lastAt: number | null;
  status: string | null;
  error: string | null;
}