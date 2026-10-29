#import "SmsNativeModule.h"
#import <UIKit/UIKit.h>

@implementation SmsNativeModule

RCT_EXPORT_MODULE(SmsNative)

RCT_EXPORT_METHOD(getDeviceInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  UIDevice *device = [UIDevice currentDevice];
  if (!device.batteryMonitoringEnabled) {
    device.batteryMonitoringEnabled = YES;
  }
  float level = device.batteryLevel;
  NSInteger batteryPct = 0;
  if (level >= 0.0f) {
    batteryPct = (NSInteger)(level * 100);
  }
  BOOL charging = device.batteryState == UIDeviceBatteryStateCharging ||
                  device.batteryState == UIDeviceBatteryStateFull;
  resolve(@{
    @"battery" : @(batteryPct),
    @"charging" : @(charging),
    @"network" : @"ios",
    @"signalStrength" : @(-1),
    @"simCount" : @(0),
    @"sims" : @[],
  });
}

RCT_EXPORT_METHOD(sendSms:(NSString *)phoneNumber
                  message:(NSString *)message
                  subscriptionId:(nonnull NSNumber *)subscriptionId
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@{
    @"success" : @NO,
    @"errorCode" : @"NOT_SUPPORTED",
    @"errorMessage" : @"iOS cannot send SMS programmatically",
  });
}

RCT_EXPORT_METHOD(requestPermissions:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@YES);
}

RCT_EXPORT_METHOD(getDeviceMetadata:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  UIDevice *device = [UIDevice currentDevice];
  resolve(@{
    @"platform" : @"ios",
    @"manufacturer" : @"Apple",
    @"model" : device.model ?: @"iPhone",
    @"androidVersion" : @"",
    @"appVersion" :
        [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"]
            ?: @"1.0.0",
  });
}

RCT_EXPORT_METHOD(getAndroidId:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve([NSNull null]);
}

@end