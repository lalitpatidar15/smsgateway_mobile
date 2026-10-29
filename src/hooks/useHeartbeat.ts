import { useEffect, useRef } from 'react';
import { ApiError, GatewayApi } from '../api/client';
import { SmsNative } from '../native/SmsNative';
import type {
  DeviceInfo,
  HeartbeatState,
  LogEntry,
  RegisteredGateway,
  SimInfo,
} from '../types';

const HEARTBEAT_INTERVAL_MS = 60000;

interface HeartbeatOptions {
  registration: RegisteredGateway | null;
  enabled: boolean;
  onLog: (entry: LogEntry) => void;
  onDeviceInfo: (info: DeviceInfo) => void;
  onHeartbeat: (state: HeartbeatState) => void;
  onUnauthorized: () => void;
}

export function useHeartbeat(options: HeartbeatOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const registration = options.registration;
  const enabled = options.enabled;

  useEffect(() => {
    if (!registration || !enabled) {
      return;
    }
    const { onLog, onDeviceInfo, onHeartbeat, onUnauthorized } = optionsRef.current;
    const api = new GatewayApi(registration.serverUrl, registration.token);
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSimsKey = '';
    let simsSynced = false;

    const syncSims = async (sims: SimInfo[]): Promise<void> => {
      if (!Array.isArray(sims) || sims.length === 0) {
        return;
      }
      for (const sim of sims) {
        if (!sim.phoneNumber || sim.phoneNumber.length === 0) {
          continue;
        }
        await api.upsertSim({
          slotIndex: sim.slotIndex,
          phoneNumber: sim.phoneNumber,
          ...(sim.carrierName ? { carrierName: sim.carrierName } : {}),
          ...(sim.subscriptionId ? { subscriptionId: String(sim.subscriptionId) } : {}),
        });
      }
    };

    const tick = async (): Promise<void> => {
      if (stopped || running) {
        return;
      }
      running = true;
      try {
        const info = await SmsNative.getDeviceInfo();
        onDeviceInfo(info);
        const simsKey = JSON.stringify(info.sims);
        if (!simsSynced || simsKey !== lastSimsKey) {
          try {
            await syncSims(info.sims);
            simsSynced = true;
            lastSimsKey = simsKey;
          } catch (error) {
            onLog({
              t: Date.now(),
              kind: 'system',
              result: 'SIM_SYNC_ERROR',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
        }
        const response = await api.heartbeat({
          battery: info.battery,
          charging: info.charging,
          network: info.network,
          signalStrength: info.signalStrength,
          simCount: info.simCount,
        });
        onHeartbeat({ lastAt: Date.now(), status: response.status, error: null });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized();
          onHeartbeat({ lastAt: null, status: null, error: 're-register required' });
          return;
        }
        onHeartbeat({
          lastAt: null,
          status: null,
          error:
            error instanceof ApiError
              ? `${error.code}: ${error.message}`
              : 'heartbeat failed',
        });
      } finally {
        running = false;
        if (!stopped) {
          timer = setTimeout(tick, HEARTBEAT_INTERVAL_MS);
        }
      }
    };

    tick();

    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, [registration, enabled]);
}