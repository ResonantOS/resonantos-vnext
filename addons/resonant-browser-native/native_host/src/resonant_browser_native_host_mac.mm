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
extern "C" void resonant_browser_native_execute_menu_command(const char* command);

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

- (void)resonantNewTab:(id)sender {
  resonant_browser_native_execute_menu_command("new_tab");
}

- (void)resonantNewWindow:(id)sender {
  resonant_browser_native_execute_menu_command("new_window");
}

- (void)resonantCloseTab:(id)sender {
  resonant_browser_native_execute_menu_command("close_tab");
}

- (void)resonantCloseWindow:(id)sender {
  resonant_browser_native_execute_menu_command("close_window");
}

- (void)resonantPrint:(id)sender {
  resonant_browser_native_execute_menu_command("print");
}

- (void)resonantSavePage:(id)sender {
  resonant_browser_native_execute_menu_command("save_page");
}

- (void)resonantFind:(id)sender {
  resonant_browser_native_execute_menu_command("find");
}

- (void)resonantFindNext:(id)sender {
  resonant_browser_native_execute_menu_command("find_next");
}

- (void)resonantFindPrevious:(id)sender {
  resonant_browser_native_execute_menu_command("find_previous");
}

- (void)resonantReloadPage:(id)sender {
  resonant_browser_native_execute_menu_command("reload");
}

- (void)resonantActualSize:(id)sender {
  resonant_browser_native_execute_menu_command("zoom_reset");
}

- (void)resonantZoomIn:(id)sender {
  resonant_browser_native_execute_menu_command("zoom_in");
}

- (void)resonantZoomOut:(id)sender {
  resonant_browser_native_execute_menu_command("zoom_out");
}

- (void)resonantViewSource:(id)sender {
  resonant_browser_native_execute_menu_command("view_source");
}

- (void)resonantDeveloperTools:(id)sender {
  resonant_browser_native_execute_menu_command("dev_tools");
}

- (void)resonantSettings:(id)sender {
  resonant_browser_native_execute_menu_command("show_settings");
}

- (void)resonantOpenAugmentor:(id)sender {
  resonant_browser_native_execute_menu_command("open_augmentor");
}

- (void)resonantNewAugmentorChat:(id)sender {
  resonant_browser_native_execute_menu_command("new_augmentor_chat");
}

- (void)resonantStopAgentControl:(id)sender {
  resonant_browser_native_execute_menu_command("stop_agent_control");
}

- (void)resonantBack:(id)sender {
  resonant_browser_native_execute_menu_command("back");
}

- (void)resonantForward:(id)sender {
  resonant_browser_native_execute_menu_command("forward");
}

- (void)resonantShowHistory:(id)sender {
  resonant_browser_native_execute_menu_command("show_history");
}

- (void)resonantShowDownloads:(id)sender {
  resonant_browser_native_execute_menu_command("show_downloads");
}

- (void)resonantBookmarkThisPage:(id)sender {
  resonant_browser_native_execute_menu_command("bookmark_this_page");
}

- (void)resonantShowBookmarks:(id)sender {
  resonant_browser_native_execute_menu_command("show_bookmarks");
}

- (void)resonantManageProfiles:(id)sender {
  resonant_browser_native_execute_menu_command("manage_profiles");
}

- (void)resonantDefaultProfile:(id)sender {
  resonant_browser_native_execute_menu_command("default_profile");
}

- (void)resonantNextTab:(id)sender {
  resonant_browser_native_execute_menu_command("next_tab");
}

- (void)resonantPreviousTab:(id)sender {
  resonant_browser_native_execute_menu_command("previous_tab");
}

- (void)resonantReopenClosedTab:(id)sender {
  resonant_browser_native_execute_menu_command("reopen_closed_tab");
}

- (void)resonantHelp:(id)sender {
  resonant_browser_native_execute_menu_command("help");
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
  ResonantAddMenuItem(fileMenu, @"New Tab", @selector(resonantNewTab:), @"t");
  ResonantAddMenuItem(fileMenu, @"New Window", @selector(resonantNewWindow:), @"n");
  [fileMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(fileMenu, @"Close Tab", @selector(resonantCloseTab:), @"w");
  ResonantAddMenuItem(fileMenu, @"Close Window", @selector(resonantCloseWindow:), @"W");
  [fileMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(fileMenu, @"Save Page As...", @selector(resonantSavePage:), @"s");
  ResonantAddMenuItem(fileMenu, @"Print", @selector(resonantPrint:), @"p");
  ResonantAddTopLevelMenu(mainMenu, @"File", fileMenu);

  NSMenu* editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
  ResonantAddMenuItem(editMenu, @"Undo", @selector(undo:), @"z");
  ResonantAddMenuItem(editMenu, @"Redo", @selector(redo:), @"Z");
  [editMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(editMenu, @"Cut", @selector(cut:), @"x");
  ResonantAddMenuItem(editMenu, @"Copy", @selector(copy:), @"c");
  ResonantAddMenuItem(editMenu, @"Paste", @selector(paste:), @"v");
  ResonantAddMenuItem(editMenu, @"Select All", @selector(selectAll:), @"a");
  [editMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(editMenu, @"Find", @selector(resonantFind:), @"f");
  ResonantAddMenuItem(editMenu, @"Find Next", @selector(resonantFindNext:), @"g");
  NSMenuItem* findPrevious = ResonantAddMenuItem(editMenu, @"Find Previous", @selector(resonantFindPrevious:), @"G");
  [findPrevious setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagShift];
  ResonantAddTopLevelMenu(mainMenu, @"Edit", editMenu);

  NSMenu* viewMenu = [[NSMenu alloc] initWithTitle:@"View"];
  [viewMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(viewMenu, @"Reload Page", @selector(resonantReloadPage:), @"r");
  ResonantAddMenuItem(viewMenu, @"Actual Size", @selector(resonantActualSize:), @"0");
  ResonantAddMenuItem(viewMenu, @"Zoom In", @selector(resonantZoomIn:), @"+");
  ResonantAddMenuItem(viewMenu, @"Zoom Out", @selector(resonantZoomOut:), @"-");
  [viewMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(viewMenu, @"View Source", @selector(resonantViewSource:), @"u");
  ResonantAddMenuItem(viewMenu, @"Developer Tools", @selector(resonantDeveloperTools:), @"i");
  [viewMenu addItem:[NSMenuItem separatorItem]];
  NSMenuItem* fullScreen = ResonantAddMenuItem(viewMenu, @"Enter Full Screen", @selector(toggleFullScreen:), @"f");
  [fullScreen setKeyEquivalentModifierMask:NSEventModifierFlagCommand | NSEventModifierFlagControl];
  ResonantAddTopLevelMenu(mainMenu, @"View", viewMenu);

  NSMenu* assistantMenu = [[NSMenu alloc] initWithTitle:@"Assistant"];
  [assistantMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(assistantMenu, @"Open Augmentor", @selector(resonantOpenAugmentor:), @"");
  ResonantAddMenuItem(assistantMenu, @"New Augmentor Chat", @selector(resonantNewAugmentorChat:), @"");
  ResonantAddMenuItem(assistantMenu, @"Stop Agent Control", @selector(resonantStopAgentControl:), @".");
  ResonantAddTopLevelMenu(mainMenu, @"Assistant", assistantMenu);

  NSMenu* historyMenu = [[NSMenu alloc] initWithTitle:@"History"];
  [historyMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(historyMenu, @"Back", @selector(resonantBack:), @"[");
  ResonantAddMenuItem(historyMenu, @"Forward", @selector(resonantForward:), @"]");
  ResonantAddMenuItem(historyMenu, @"Show History", @selector(resonantShowHistory:), @"y");
  ResonantAddMenuItem(historyMenu, @"Show Downloads", @selector(resonantShowDownloads:), @"j");
  ResonantAddTopLevelMenu(mainMenu, @"History", historyMenu);

  NSMenu* bookmarksMenu = [[NSMenu alloc] initWithTitle:@"Bookmarks"];
  [bookmarksMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(bookmarksMenu, @"Bookmark This Page", @selector(resonantBookmarkThisPage:), @"d");
  ResonantAddMenuItem(bookmarksMenu, @"Show Bookmarks", @selector(resonantShowBookmarks:), @"b");
  ResonantAddTopLevelMenu(mainMenu, @"Bookmarks", bookmarksMenu);

  NSMenu* profilesMenu = [[NSMenu alloc] initWithTitle:@"Profiles"];
  [profilesMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(profilesMenu, @"Default Profile", @selector(resonantDefaultProfile:), @"");
  ResonantAddMenuItem(profilesMenu, @"Manage Profiles", @selector(resonantManageProfiles:), @"");
  [profilesMenu addItem:[NSMenuItem separatorItem]];
  ResonantAddMenuItem(profilesMenu, @"Browser Settings", @selector(resonantSettings:), @",");
  ResonantAddTopLevelMenu(mainMenu, @"Profiles", profilesMenu);

  NSMenu* tabMenu = [[NSMenu alloc] initWithTitle:@"Tab"];
  [tabMenu setAutoenablesItems:NO];
  ResonantAddMenuItem(tabMenu, @"Next Tab", @selector(resonantNextTab:), @"]");
  ResonantAddMenuItem(tabMenu, @"Previous Tab", @selector(resonantPreviousTab:), @"[");
  ResonantAddMenuItem(tabMenu, @"Reopen Closed Tab", @selector(resonantReopenClosedTab:), @"T");
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
  ResonantAddMenuItem(helpMenu, @"ResonantOS Browser Help", @selector(resonantHelp:), @"");
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
