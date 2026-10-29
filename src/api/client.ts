import type {
  GatewayHeartbeatStatus,
  GatewayRegisterResponse,
  JobStatus,
  SimInfo,
  Stats,
  SmsJob,
} from '../types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface BackendErrorBody {
  success?: boolean;
  error?: { code?: string; message?: string; requestId?: string };
}

export interface HttpRequestOptions {
  method?: string;
  url: string;
  body?: unknown;
  token?: string;
  timeoutMs?: number;
}

export async function httpRequest<T>(options: HttpRequestOptions): Promise<T> {
  const { url, method = 'GET', body, token, timeoutMs = 20000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      const err: Partial<BackendErrorBody> =
        typeof data === 'object' && data !== null ? (data as BackendErrorBody) : {};
      const status = response.status;
      const code = err.error?.code ?? `HTTP_${status}`;
      const message = err.error?.message ?? `Request failed with status ${status}`;
      throw new ApiError(status, code, message);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new ApiError(0, 'TIMEOUT', `Request timed out after ${timeoutMs}ms`);
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export class GatewayApi {
  readonly serverUrl: string;
  readonly token: string;

  constructor(serverUrl: string, token: string) {
    this.serverUrl = normalizeServerUrl(serverUrl);
    this.token = token;
  }

  register(body: {
    deviceId: string;
    name: string;
    phoneNumber?: string;
    platform?: string;
    appVersion?: string;
    manufacturer?: string;
    model?: string;
    androidVersion?: string;
  }): Promise<GatewayRegisterResponse> {
    return httpRequest<GatewayRegisterResponse>({
      method: 'POST',
      url: `${this.serverUrl}/api/v1/gateways/register`,
      body,
    });
  }

  heartbeat(body: {
    battery?: number;
    charging?: boolean;
    network?: string;
    signalStrength?: number;
    simCount?: number;
  }): Promise<{ status: GatewayHeartbeatStatus }> {
    return httpRequest<{ status: GatewayHeartbeatStatus }>({
      method: 'POST',
      url: `${this.serverUrl}/api/v1/gateways/heartbeat`,
      token: this.token,
      body,
    });
  }

  pending(limit = 5): Promise<{ messages: SmsJob[] }> {
    return httpRequest<{ messages: SmsJob[] }>({
      method: 'GET',
      url: `${this.serverUrl}/api/v1/gateways/messages/pending?limit=${limit}`,
      token: this.token,
    });
  }

  claim(limit = 5): Promise<{ messages: SmsJob[] }> {
    return httpRequest<{ messages: SmsJob[] }>({
      method: 'POST',
      url: `${this.serverUrl}/api/v1/gateways/messages/claim`,
      token: this.token,
      body: { limit },
    });
  }

  reportStatus(
    messageId: string,
    body: {
      status: JobStatus;
      errorCode?: string;
      errorMessage?: string;
      providerReference?: string;
    },
  ): Promise<{ success: boolean }> {
    return httpRequest<{ success: boolean }>({
      method: 'POST',
      url: `${this.serverUrl}/api/v1/gateways/messages/${encodeURIComponent(
        messageId,
      )}/status`,
      token: this.token,
      body,
    });
  }

  listSims(): Promise<SimInfo[]> {
    return httpRequest<SimInfo[]>({
      method: 'GET',
      url: `${this.serverUrl}/api/v1/gateways/sims`,
      token: this.token,
    });
  }

  upsertSim(body: {
    slotIndex: number;
    phoneNumber: string;
    carrierName?: string | null;
    subscriptionId?: number | string | null;
    countryCode?: string;
    isDefault?: boolean;
  }): Promise<unknown> {
    return httpRequest<unknown>({
      method: 'POST',
      url: `${this.serverUrl}/api/v1/gateways/sims`,
      token: this.token,
      body,
    });
  }

  stats(): Promise<Stats> {
    return httpRequest<Stats>({
      method: 'GET',
      url: `${this.serverUrl}/sms/stats`,
      token: this.token,
    });
  }
}