#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(RoomPlanPlugin, "RoomPlan",
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startScan, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(capturePhoto, CAPPluginReturnPromise);
)
