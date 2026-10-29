import { useEffect, useRef } from 'react';
import { ApiError, GatewayApi } from '../api/client';
import { SmsNative } from '../native/SmsNative';
import type { LogEntry, RegisteredGateway, SmsJob } from '../types';

const CLAIM_LIMIT = 5;
const BASE_INTERVAL_MS = 8000;
const MAX_INTERVAL_MS = 60000;

interface SendWorkerOptions {
  registration: RegisteredGateway | null;
  enabled: boolean;
  onLog: (entry: LogEntry) => void;
  onUnauthorized: () => void;
}

export function useSendWorker(options: SendWorkerOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const registration = options.registration;
  const enabled = options.enabled;

  useEffect(() => {
    if (!registration || !enabled) {
      return;
    }
    const { onLog, onUnauthorized } = optionsRef.current;
    const api = new GatewayApi(registration.serverUrl, registration.token);
    let stopped = false;
    let busy = false;
    let intervalMs = BASE_INTERVAL_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const log = (entry: Omit<LogEntry, 't'>): void => {
      onLog({ t: Date.now(), ...entry });
    };

    const reportJobStatus = async (
      job: SmsJob,
      body: {
        status: 'SENDING' | 'SENT' | 'FAILED';
        errorCode?: string;
        errorMessage?: string;
      },
    ): Promise<void> => {
      try {
        await api.reportStatus(job.id, body);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          throw error;
        }
      }
    };

    const processJob = async (job: SmsJob): Promise<void> => {
      log({ kind: 'send', messageId: job.id, recipient: job.recipient, result: 'CLAIMED' });
      await reportJobStatus(job, { status: 'SENDING' });
      const sendResult = await SmsNative.sendSms(
        job.recipient,
        job.message,
        null,
      );
      if (sendResult.success) {
        await reportJobStatus(job, { status: 'SENT' });
        log({ kind: 'send', messageId: job.id, recipient: job.recipient, result: 'SENT' });
      } else {
        await reportJobStatus(job, {
          status: 'FAILED',
          errorCode: sendResult.errorCode,
          errorMessage: sendResult.errorMessage,
        });
        log({
          kind: 'send',
          messageId: job.id,
          recipient: job.recipient,
          result: 'FAILED',
          detail: sendResult.errorMessage,
        });
      }
    };

    const tick = async (): Promise<void> => {
      if (stopped || busy) {
        return;
      }
      busy = true;
      try {
        const { messages } = await api.claim(CLAIM_LIMIT);
        intervalMs = BASE_INTERVAL_MS;
        const jobs = Array.isArray(messages) ? messages : [];
        for (const job of jobs) {
          if (stopped) {
            return;
          }
          try {
            await processJob(job);
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              throw error;
            }
            log({
              kind: 'send',
              messageId: job.id,
              recipient: job.recipient,
              result: 'ERROR',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        if (stopped) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          intervalMs = MAX_INTERVAL_MS;
          onUnauthorized();
          log({ kind: 'system', result: 'UNAUTHORIZED', detail: 'token invalid, re-register required' });
          return;
        }
        if (error instanceof ApiError) {
          log({ kind: 'system', result: 'API_ERROR', detail: `${error.code}: ${error.message}` });
        } else {
          log({
            kind: 'system',
            result: 'WORKER_ERROR',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        intervalMs = Math.min(MAX_INTERVAL_MS, intervalMs * 2);
      } finally {
        busy = false;
        if (!stopped) {
          timer = setTimeout(tick, intervalMs);
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