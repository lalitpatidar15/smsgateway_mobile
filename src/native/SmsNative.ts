import { NativeModules } from 'react-native';
import type { DeviceInfo, DeviceMetadata, SendResult } from '../types';

export interface SmsNativeModule {
  getDeviceInfo(): Promise<DeviceInfo>;
  sendSms(
    phoneNumber: string,
    message: string,
    subscriptionId: number | null,
  ): Promise<SendResult>;
  requestPermissions(): Promise<boolean>;
  getDeviceMetadata(): Promise<DeviceMetadata>;
  getAndroidId(): Promise<string | null>;
}

const native = NativeModules.SmsNative as SmsNativeModule | undefined;

const emptyDeviceInfo: DeviceInfo = {
  battery: 0,
  charging: false,
  network: 'UNKNOWN',
  signalStrength: -1,
  simCount: 0,
  sims: [],
};

const emptyMetadata: DeviceMetadata = {
  platform: 'android',
  manufacturer: '',
  model: 'Unknown',
  androidVersion: '',
  appVersion: '0.0.1',
};

function isPresent(module: SmsNativeModule | undefined): module is SmsNativeModule {
  return typeof module === 'object' && module !== null;
}

export const SmsNative: SmsNativeModule = {
  async getDeviceInfo(): Promise<DeviceInfo> {
    if (!isPresent(native)) {
      return { ...emptyDeviceInfo };
    }
    return native.getDeviceInfo();
  },

  async sendSms(
    phoneNumber: string,
    message: string,
    subscriptionId: number | null,
  ): Promise<SendResult> {
    if (!isPresent(native)) {
      return {
        success: false,
        errorCode: 'NOT_SUPPORTED',
        errorMessage: 'SMS not supported on this platform',
      };
    }
    return native.sendSms(phoneNumber, message, subscriptionId);
  },

  async requestPermissions(): Promise<boolean> {
    if (!isPresent(native)) {
      return false;
    }
    return native.requestPermissions();
  },

  async getDeviceMetadata(): Promise<DeviceMetadata> {
    if (!isPresent(native)) {
      return { ...emptyMetadata };
    }
    return native.getDeviceMetadata();
  },

  async getAndroidId(): Promise<string | null> {
    if (!isPresent(native)) {
      return null;
    }
    const id = await native.getAndroidId();
    return id && id.length > 0 ? id : null;
  },
};