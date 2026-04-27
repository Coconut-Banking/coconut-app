#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ProximityReaderDiscoveryModule, NSObject)

RCT_EXTERN_METHOD(
  presentEducation:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

+ (BOOL)requiresMainQueueSetup;

@end
