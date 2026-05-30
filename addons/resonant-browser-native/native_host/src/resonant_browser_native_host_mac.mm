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

static NSMenuItem* ResonantAddMenuItem(NSMenu* menu,
                                       NSString* title,
                                       SEL action,
                                       NSString* keyEquivalent) {
  NSMenuItem* item = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:keyEquivalent ?: @""];
  if (action == nil) {
    // Browser-command menu items are declared at the native chrome layer now,
    // then wired to CEF/browser commands incrementally. Keep them visible so
    // the application menu structure matches a real browser instead of hiding
    // the command surface behind the extension UI.
    [item setEnabled:YES];
  }
  [menu addItem:item];
  return item;
}

static void ResonantAddTopLevelMenu(NSMenu* mainMenu, NSString* title, NSMenu* submenu) {
  NSMenuItem* item = [[NSMenuItem alloc] initWithTitle:title action:nil keyEquivalent:@""];
  [item setSubmenu:submenu];
  [mainMenu addItem:item];
}

static void ResonantInstallMainMenu() {
  // Intent citation: docs/architecture/ADR-037-browser-first-chromium-resonantos.md
  // Browser-first ResonantOS is a real desktop browser application. The
  // macOS menu bar is native AppKit chrome, not extension HTML, so the host
  // declares the standard browser menu categories here.
  NSMenu* mainMenu = [[NSMenu alloc] initWithTitle:@""];

  NSMenu* appMenu = [[NSMenu alloc] initWithTitle:@"ResonantOS Browser"];
  ResonantAddMenuItem(appMenu, @"About ResonantOS Browser", @selector(orderFrontStandardAboutPanel:), @"");
  [appMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(appMenu, @"Hide ResonantOS Browser", @selector(hide:), @"h");
  NSMenuItem* hideOthers = ResonantAddMenuItem(appMenu, @"Hide Others", @selector(hideOtherApplications:), @"h");
  [hideOthers setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagOption];
  ResonantAddMenuItem(appMenu, @"Show All", @selector(unhideAllApplications:), @"");
  [appMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(appMenu, @"Quit ResonantOS Browser", @selector(terminate:), @"q");
  ResonantAddTopLevelMenu(mainMenu, @"ResonantOS Browser", appMenu);

  NSMenu* fileMenu = [[NSMenu alloc] initWithTitle:@"File"];
  [fileMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(fileMenu, @"New Tab", nil, @"t");
  ResonantAddMenuItem(fileMenu, @"New Window", nil, @"n");
  [fileMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(fileMenu, @"Close Tab", nil, @"w");
  ResonantAddMenuItem(fileMenu, @"Close Window", nil, @"W");
  [fileMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(fileMenu, @"Print", @selector(print:), @"p");
  ResonantAddTopLevelMenu(mainMenu, @"File", fileMenu);

  NSMenu* editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
  ResonantAddMenuItem(editMenu, @"Undo", @selector(undo:), @"z");
  ResonantAddMenuItem(editMenu, @"Redo", @selector(redo:), @"Z");
  [editMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(editMenu, @"Cut", @selector(cut:), @"x");
  ResonantAddMenuItem(editMenu, @"Copy", @selector(copy:), @"c");
  ResonantAddMenuItem(editMenu, @"Paste", @selector(paste:), @"v");
  ResonantAddMenuItem(editMenu, @"Select All", @selector(selectAll:), @"a");
  ResonantAddTopLevelMenu(mainMenu, @"Edit", editMenu);

  NSMenu* viewMenu = [[NSMenu alloc] initWithTitle:@"View"];
  [viewMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(viewMenu, @"Reload Page", nil, @"r");
  ResonantAddMenuItem(viewMenu, @"Actual Size", nil, @"0");
  ResonantAddMenuItem(viewMenu, @"Zoom In", nil, @"+");
  ResonantAddMenuItem(viewMenu, @"Zoom Out", nil, @"-");
  [viewMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(viewMenu, @"Enter Full Screen", @selector(toggleFullScreen:), @"f");
  ResonantAddTopLevelMenu(mainMenu, @"View", viewMenu);

  NSMenu* assistantMenu = [[NSMenu alloc] initWithTitle:@"Assistant"];
  [assistantMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(assistantMenu, @"Open Augmentor", nil, @"");
  ResonantAddMenuItem(assistantMenu, @"New Augmentor Chat", nil, @"");
  ResonantAddMenuItem(assistantMenu, @"Stop Agent Control", nil, @".");
  ResonantAddTopLevelMenu(mainMenu, @"Assistant", assistantMenu);

  NSMenu* historyMenu = [[NSMenu alloc] initWithTitle:@"History"];
  [historyMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(historyMenu, @"Back", nil, @"[");
  ResonantAddMenuItem(historyMenu, @"Forward", nil, @"]");
  ResonantAddMenuItem(historyMenu, @"Show History", nil, @"y");
  ResonantAddTopLevelMenu(mainMenu, @"History", historyMenu);

  NSMenu* bookmarksMenu = [[NSMenu alloc] initWithTitle:@"Bookmarks"];
  [bookmarksMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(bookmarksMenu, @"Bookmark This Page", nil, @"d");
  ResonantAddMenuItem(bookmarksMenu, @"Show Bookmarks", nil, @"b");
  ResonantAddTopLevelMenu(mainMenu, @"Bookmarks", bookmarksMenu);

  NSMenu* profilesMenu = [[NSMenu alloc] initWithTitle:@"Profiles"];
  [profilesMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(profilesMenu, @"Default Profile", nil, @"");
  ResonantAddMenuItem(profilesMenu, @"Manage Profiles", nil, @"");
  ResonantAddTopLevelMenu(mainMenu, @"Profiles", profilesMenu);

  NSMenu* tabMenu = [[NSMenu alloc] initWithTitle:@"Tab"];
  [tabMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(tabMenu, @"Next Tab", nil, @"]");
  ResonantAddMenuItem(tabMenu, @"Previous Tab", nil, @"[");
  ResonantAddMenuItem(tabMenu, @"Reopen Closed Tab", nil, @"T");
  ResonantAddTopLevelMenu(mainMenu, @"Tab", tabMenu);

  NSMenu* windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
  ResonantAddMenuItem(windowMenu, @"Minimize", @selector(performMiniaturize:), @"m");
  ResonantAddMenuItem(windowMenu, @"Zoom", @selector(performZoom:), @"");
  [windowMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(windowMenu, @"Bring All to Front", @selector(arrangeInFront:), @"");
  [NSApp setWindowsMenu:windowMenu];
  ResonantAddTopLevelMenu(mainMenu, @"Window", windowMenu);

  NSMenu* helpMenu = [[NSMenu alloc] initWithTitle:@"Help"];
  [helpMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(helpMenu, @"ResonantOS Browser Help", nil, @"");
  ResonantAddTopLevelMenu(mainMenu, @"Help", helpMenu);
  [NSApp setHelpMenu:helpMenu];

  [NSApp setMainMenu:mainMenu];
}

int main(int argc, char* argv[]) {
  CefScopedLibraryLoader library_loader;
  if (!library_loader.LoadInMain()) {
    return 1;
  }

  @autoreleasepool {
    [ResonantBrowserApplication sharedApplication];
    CHECK([NSApp isKindOfClass:[ResonantBrowserApplication class]]);
    ResonantInstallMainMenu();
    return resonant_browser_native_cef_main(argc, argv);
  }
}
