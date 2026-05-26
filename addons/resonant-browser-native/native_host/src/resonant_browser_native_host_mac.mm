// Intent citation: docs/architecture/ADR-025-native-embedded-browser-host.md
//
// macOS CEF bootstrap. CEF binary distributions require the framework to be
// loaded dynamically and the app process to use a CefAppProtocol-aware
// NSApplication before CefInitialize runs.

#import <Cocoa/Cocoa.h>

#include "include/cef_app.h"
#include "include/cef_application_mac.h"
#include "include/wrapper/cef_helpers.h"
#include "include/wrapper/cef_library_loader.h"

int resonant_browser_native_cef_main(int argc, char* argv[]);

@interface ResonantBrowserApplication : NSApplication <CefAppProtocol> {
 @private
  BOOL handlingSendEvent_;
}
@end

@implementation ResonantBrowserApplication
- (BOOL)isHandlingSendEvent {
  return handlingSendEvent_;
}

- (void)setHandlingSendEvent:(BOOL)handlingSendEvent {
  handlingSendEvent_ = handlingSendEvent;
}

- (void)sendEvent:(NSEvent*)event {
  CefScopedSendingEvent sendingEventScoper;
  [super sendEvent:event];
}

- (void)terminate:(id)sender {
  CefQuitMessageLoop();
}
@end

int main(int argc, char* argv[]) {
  CefScopedLibraryLoader library_loader;
  if (!library_loader.LoadInMain()) {
    return 1;
  }

  @autoreleasepool {
    [ResonantBrowserApplication sharedApplication];
    CHECK([NSApp isKindOfClass:[ResonantBrowserApplication class]]);
    return resonant_browser_native_cef_main(argc, argv);
  }
}
