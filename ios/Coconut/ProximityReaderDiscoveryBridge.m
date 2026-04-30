#import <React/RCTBridgeModule.h>

RCT_EXTERN void RCTRegisterModule(Class);

@interface ProximityReaderDiscoveryModule : NSObject
@end

@interface ProximityReaderDiscoveryModule (RCTExternModule) <RCTBridgeModule>
@end

@implementation ProximityReaderDiscoveryModule (RCTExternModule)

+ (NSString *)moduleName {
  return @"ProximityReaderDiscoveryModule";
}

__attribute__((constructor))
static void initialize_ProximityReaderDiscoveryModule(void) {
  RCTRegisterModule([ProximityReaderDiscoveryModule class]);
}

+ (const RCTMethodInfo *)__rct_export__presentEducation {
  static RCTMethodInfo config = {
    "",
    "presentEducation:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject",
    NO
  };
  return &config;
}

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
