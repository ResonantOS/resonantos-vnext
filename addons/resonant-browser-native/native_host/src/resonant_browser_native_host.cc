// Intent citation: docs/architecture/ADR-025-native-embedded-browser-host.md
//
// Product direction:
// - CEF Chrome Runtime candidate.
// - Embedded child view only; rejected product paths must not be used.
// - Extension compatibility must be proven for Phantom Wallet and Bitwarden.

#include <algorithm>
#include <array>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#if defined(__APPLE__)
#include <mach-o/dyld.h>
#include <unistd.h>
#endif

#include "include/cef_app.h"
#include "include/cef_browser.h"
#include "include/cef_client.h"
#include "include/cef_command_line.h"
#include "include/cef_display_handler.h"
#include "include/cef_download_handler.h"
#include "include/cef_id_mappers.h"
#include "include/cef_keyboard_handler.h"
#include "include/cef_request_context.h"
#include "include/cef_task.h"
#include "include/wrapper/cef_helpers.h"

namespace resonantos {

constexpr const char* kDefaultUrl = "https://resonantos.com";
constexpr const char* kChromeExtensionsUrl = "chrome://extensions";
constexpr const char* kChromeNewTabFooterUrl = "chrome://newtab-footer";
constexpr const char* kChromeWebStoreUrl = "https://chromewebstore.google.com/category/extensions";
constexpr const char* kBrowserFirstCommand = "browser.first.start";
constexpr const char* kProbeCommand = "browser.native.probe";
constexpr const char* kBridgeProbeCommand = "browser.native.bridge_probe";
constexpr const char* kStartCommand = "browser.native.start";
constexpr const char* kAttachSmokeCommand = "browser.native.attach_smoke";
constexpr const char* kAttachViewCommand = "browser.native.attach_view";
constexpr const char* kSetBoundsCommand = "browser.native.set_bounds";
constexpr const char* kOpenUrlCommand = "browser.native.open_url";
constexpr const char* kBackCommand = "browser.native.back";
constexpr const char* kForwardCommand = "browser.native.forward";
constexpr const char* kReloadCommand = "browser.native.reload";
constexpr const char* kReadPageCommand = "browser.native.read_page";
constexpr const char* kClickCommand = "browser.native.click";
constexpr const char* kTypeCommand = "browser.native.type";
constexpr const char* kScrollCommand = "browser.native.scroll";
constexpr const char* kExtensionInstallCommand = "browser.native.extension.install";
constexpr const char* kExtensionListCommand = "browser.native.extension.list";
constexpr const char* kExtensionEnableCommand = "browser.native.extension.enable";
constexpr const char* kExtensionPinCommand = "browser.native.extension.pin";
constexpr const char* kExtensionDisableCommand = "browser.native.extension.disable";
constexpr const char* kWalletConfirmationCommand = "browser.native.wallet.confirmation_state";
constexpr const char* kCloseCommand = "browser.native.close";
constexpr const char* kMacBaseHelperName = "ResonantBrowserNativeHost Helper";

std::string JsonEscape(const std::string& value) {
  std::ostringstream escaped;
  for (const char character : value) {
    switch (character) {
      case '\\':
        escaped << "\\\\";
        break;
      case '"':
        escaped << "\\\"";
        break;
      case '\n':
        escaped << "\\n";
        break;
      case '\r':
        escaped << "\\r";
        break;
      case '\t':
        escaped << "\\t";
        break;
      default:
        escaped << character;
    }
  }
  return escaped.str();
}

std::string SafeDownloadFileName(const std::string& suggested_name, const std::string& fallback_name) {
  std::string name = suggested_name.empty() ? fallback_name : suggested_name;
  for (char& character : name) {
    const bool invalid = character == '/' || character == '\\' || character == ':' || character == '\0';
    if (invalid) {
      character = '_';
    }
  }
  if (name.empty() || name == "." || name == "..") {
    return "resonantos-download.bin";
  }
  return name;
}

struct NativeViewBounds {
  int x = 0;
  int y = 0;
  int width = 1280;
  int height = 800;
};

std::vector<std::string> SplitCsv(const std::string& value) {
  std::vector<std::string> parts;
  std::stringstream stream(value);
  std::string item;
  while (std::getline(stream, item, ',')) {
    if (!item.empty()) {
      parts.push_back(item);
    }
  }
  return parts;
}

std::filesystem::path CurrentExecutablePath() {
#if defined(__APPLE__)
  std::array<char, 4096> path_buffer{};
  uint32_t buffer_size = static_cast<uint32_t>(path_buffer.size());
  if (_NSGetExecutablePath(path_buffer.data(), &buffer_size) == 0) {
    return std::filesystem::weakly_canonical(path_buffer.data());
  }
#endif
  return {};
}

std::filesystem::path MacBaseHelperExecutablePath() {
  const auto executable_path = CurrentExecutablePath();
  if (executable_path.empty()) {
    return {};
  }

  // .../ResonantBrowserNativeHost.app/Contents/MacOS/ResonantBrowserNativeHost
  const auto contents_path = executable_path.parent_path().parent_path();
  return contents_path / "Frameworks" /
         (std::string(kMacBaseHelperName) + ".app") / "Contents" / "MacOS" / kMacBaseHelperName;
}

std::filesystem::path MacMainBundlePath() {
  const auto executable_path = CurrentExecutablePath();
  if (executable_path.empty()) {
    return {};
  }

  // .../ResonantBrowserNativeHost.app/Contents/MacOS/ResonantBrowserNativeHost
  return executable_path.parent_path().parent_path().parent_path();
}

class QuitMessageLoopTask final : public CefTask {
 public:
  QuitMessageLoopTask() = default;
  void Execute() override { CefQuitMessageLoop(); }

 private:
  IMPLEMENT_REFCOUNTING(QuitMessageLoopTask);
  DISALLOW_COPY_AND_ASSIGN(QuitMessageLoopTask);
};

class SmokeTimeoutTask final : public CefTask {
 public:
  SmokeTimeoutTask() = default;
  void Execute() override {
    std::cerr << "Resonant Browser native smoke timed out before clean shutdown." << std::endl;
    CefQuitMessageLoop();
  }

 private:
  IMPLEMENT_REFCOUNTING(SmokeTimeoutTask);
  DISALLOW_COPY_AND_ASSIGN(SmokeTimeoutTask);
};

class OpenAugmentorSidePanelTask final : public CefTask {
 public:
  explicit OpenAugmentorSidePanelTask(CefRefPtr<CefBrowser> browser) : browser_(browser) {}

  void Execute() override {
    if (!browser_) {
      return;
    }
    // Intent citation: docs/architecture/ADR-037-browser-first-chromium-resonantos.md
    // Chrome's sidePanel.open API requires a user-gesture equivalent. The
    // browser host owns startup UX, so it dispatches the extension command
    // accelerator instead of opening a competing ResonantOS tab.
    CefKeyEvent down;
    down.type = KEYEVENT_RAWKEYDOWN;
    down.windows_key_code = 'A';
    down.native_key_code = 'A';
    down.modifiers = EVENTFLAG_ALT_DOWN | EVENTFLAG_SHIFT_DOWN;
    browser_->GetHost()->SendKeyEvent(down);

    CefKeyEvent up;
    up.type = KEYEVENT_KEYUP;
    up.windows_key_code = 'A';
    up.native_key_code = 'A';
    up.modifiers = EVENTFLAG_ALT_DOWN | EVENTFLAG_SHIFT_DOWN;
    browser_->GetHost()->SendKeyEvent(up);
  }

 private:
  CefRefPtr<CefBrowser> browser_;

  IMPLEMENT_REFCOUNTING(OpenAugmentorSidePanelTask);
  DISALLOW_COPY_AND_ASSIGN(OpenAugmentorSidePanelTask);
};

bool IsPrimaryBrowserShortcut(const CefKeyEvent& event) {
  if (event.type != KEYEVENT_RAWKEYDOWN) {
    return false;
  }
  const bool primary_modifier =
      (event.modifiers & EVENTFLAG_COMMAND_DOWN) != 0 ||
      (event.modifiers & EVENTFLAG_CONTROL_DOWN) != 0;
  return primary_modifier &&
         (event.modifiers & EVENTFLAG_ALT_DOWN) == 0 &&
         (event.modifiers & EVENTFLAG_SHIFT_DOWN) == 0;
}

class ResonantBrowserClient final : public CefClient,
                                    public CefDisplayHandler,
                                    public CefDownloadHandler,
                                    public CefKeyboardHandler,
                                    public CefLifeSpanHandler,
                                    public CefLoadHandler {
 public:
  ResonantBrowserClient() = default;

  CefRefPtr<CefDisplayHandler> GetDisplayHandler() override { return this; }
  CefRefPtr<CefDownloadHandler> GetDownloadHandler() override { return this; }
  CefRefPtr<CefKeyboardHandler> GetKeyboardHandler() override { return this; }
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }
  CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }

  void OnAfterCreated(CefRefPtr<CefBrowser> browser) override {
    CEF_REQUIRE_UI_THREAD();
    browsers_.push_back(browser);
    active_browser_ = browser;
  }

  bool DoClose(CefRefPtr<CefBrowser> browser) override {
    CEF_REQUIRE_UI_THREAD();
    return false;
  }

  bool OnPreKeyEvent(CefRefPtr<CefBrowser> browser,
                     const CefKeyEvent& event,
                     CefEventHandle os_event,
                     bool* is_keyboard_shortcut) override {
    CEF_REQUIRE_UI_THREAD();
    (void)os_event;
    if (!IsPrimaryBrowserShortcut(event)) {
      return false;
    }

    const int key_code = event.windows_key_code;
    active_browser_ = browser;
    if (key_code == 'T' || key_code == 't') {
      MarkKeyboardShortcut(is_keyboard_shortcut);
      OpenNewBrowserSurface();
      return true;
    }
    if (key_code == 'W' || key_code == 'w') {
      MarkKeyboardShortcut(is_keyboard_shortcut);
      if (browser) {
        browser->GetHost()->CloseBrowser(false);
      }
      return true;
    }
    if (key_code == 'Q' || key_code == 'q') {
      MarkKeyboardShortcut(is_keyboard_shortcut);
      CloseAllBrowserSurfaces();
      return true;
    }
    return false;
  }

  void OnBeforeClose(CefRefPtr<CefBrowser> browser) override {
    CEF_REQUIRE_UI_THREAD();
    browsers_.erase(std::remove(browsers_.begin(), browsers_.end(), browser), browsers_.end());
    if (browsers_.empty()) {
      CefQuitMessageLoop();
    }
  }

  void OnTitleChange(CefRefPtr<CefBrowser> browser, const CefString& title) override {
    CEF_REQUIRE_UI_THREAD();
    const std::string title_text = title.ToString();
    std::cout << "{\"event\":\"browser.native.title_changed\",\"title\":\"" << title_text << "\"}"
              << std::endl;
    if (phantom_extension_smoke_ &&
        title_text.find("resonant-phantom-provider-detected") != std::string::npos &&
        !quit_requested_) {
      quit_requested_ = true;
      std::cout << "{\"event\":\"browser.native.phantom_provider_detection\","
                << "\"providerInjected\":true,"
                << "\"extensionId\":\"bfnaelmomeimhlpmgjnjophhpkkoljpa\","
                << "\"verdict\":\"phantom-provider-ready\"}" << std::endl;
      browser->GetHost()->CloseBrowser(true);
      CefPostDelayedTask(TID_UI, new QuitMessageLoopTask(), 250);
      return;
    }
    if (phantom_extension_smoke_ &&
        title_text.find("resonant-phantom-provider-missing") != std::string::npos &&
        !quit_requested_) {
      quit_requested_ = true;
      std::cout << "{\"event\":\"browser.native.phantom_provider_detection\","
                << "\"providerInjected\":false,"
                << "\"extensionId\":\"bfnaelmomeimhlpmgjnjophhpkkoljpa\","
                << "\"verdict\":\"phantom-provider-blocked\"}" << std::endl;
      browser->GetHost()->CloseBrowser(true);
      CefPostDelayedTask(TID_UI, new QuitMessageLoopTask(), 250);
      return;
    }
    if (local_extension_smoke_ && title_text.find("resonant-extension-loaded") != std::string::npos &&
        !quit_requested_) {
      quit_requested_ = true;
      std::cout << "{\"event\":\"browser.native.local_extension_execution\","
                << "\"contentScriptExecuted\":true,"
                << "\"verdict\":\"local-extension-ready\"}" << std::endl;
      browser->GetHost()->CloseBrowser(true);
      CefPostDelayedTask(TID_UI, new QuitMessageLoopTask(), 250);
    }
  }

  void OnLoadEnd(CefRefPtr<CefBrowser> browser,
                 CefRefPtr<CefFrame> frame,
                 int http_status_code) override {
    CEF_REQUIRE_UI_THREAD();
      if (frame && frame->IsMain()) {
      active_browser_ = browser;
      const std::string loaded_url = frame->GetURL().ToString();
      std::cout << "{\"event\":\"browser.native.load_end\",\"status\":" << http_status_code
                << ",\"url\":\"" << loaded_url << "\"}" << std::endl;
      if (loaded_url.rfind(kChromeNewTabFooterUrl, 0) == 0) {
        // Intent citation: docs/architecture/ADR-037-browser-first-chromium-resonantos.md
        // Chromium injects a separate chrome://newtab-footer surface for
        // extension-controlled new-tab experiences. ResonantOS moves those
        // controls into Settings/About and closes the footer so the main
        // workspace owns the full visible browser surface.
        browser->GetHost()->CloseBrowser(true);
        return;
      }
      const bool loaded_web_page =
          loaded_url.rfind("http://", 0) == 0 || loaded_url.rfind("https://", 0) == 0;
      if (browser_first_auto_open_side_panel_ && !browser_first_side_panel_requested_ && loaded_web_page) {
        browser_first_side_panel_requested_ = true;
        CefPostDelayedTask(TID_UI, new OpenAugmentorSidePanelTask(browser), 750);
      }
      if (download_smoke_ && !download_started_) {
        download_started_ = true;
        const std::string target_url = download_url_.empty() ? loaded_url : download_url_;
        std::cout << "{\"event\":\"browser.native.download_start_requested\","
                  << "\"url\":\"" << JsonEscape(target_url) << "\"}" << std::endl;
        browser->GetHost()->StartDownload(target_url);
        return;
      }
      if (extension_entrypoint_smoke_) {
        loaded_urls_.push_back(loaded_url);
        if (next_smoke_url_index_ < smoke_urls_.size()) {
          browser->GetMainFrame()->LoadURL(smoke_urls_[next_smoke_url_index_++]);
          return;
        }
        if (!quit_requested_) {
          quit_requested_ = true;
          const bool extensions_page_loaded = std::any_of(
              loaded_urls_.begin(), loaded_urls_.end(), [](const std::string& url) {
                return url.rfind("chrome://extensions", 0) == 0;
              });
          const bool web_store_loaded = std::any_of(
              loaded_urls_.begin(), loaded_urls_.end(), [](const std::string& url) {
                return url.rfind(kChromeWebStoreUrl, 0) == 0;
              });
          const bool web_store_consent_gate = std::any_of(
              loaded_urls_.begin(), loaded_urls_.end(), [](const std::string& url) {
                return url.find("consent.google.com") != std::string::npos &&
                       url.find("chromewebstore.google.com") != std::string::npos;
              });
          const char* verdict =
              extensions_page_loaded && web_store_loaded
                  ? "entrypoints-ready"
                  : extensions_page_loaded && web_store_consent_gate ? "chrome-web-store-consent-gated"
                                                                     : "entrypoints-blocked";
          std::cout << "{\"event\":\"browser.native.extension_entrypoints\","
                    << "\"chromeExtensionsLoaded\":" << (extensions_page_loaded ? "true" : "false") << ","
                    << "\"chromeWebStoreLoaded\":" << (web_store_loaded ? "true" : "false") << ","
                    << "\"chromeWebStoreConsentGate\":" << (web_store_consent_gate ? "true" : "false") << ","
                    << "\"verdict\":\"" << verdict << "\"}" << std::endl;
          browser->GetHost()->CloseBrowser(true);
          CefPostDelayedTask(TID_UI, new QuitMessageLoopTask(), 250);
        }
        return;
      }
      if (phantom_extension_smoke_ && !phantom_probe_scheduled_) {
        phantom_probe_scheduled_ = true;
        frame->ExecuteJavaScript(
            "setTimeout(() => {"
            "  const solana = globalThis.phantom?.solana || globalThis.solana;"
            "  document.title = solana?.isPhantom ? "
            "    'resonant-phantom-provider-detected' : "
            "    'resonant-phantom-provider-missing';"
            "}, 1500);",
            loaded_url,
            0);
        return;
      }
      if (quit_after_first_main_frame_load_ && !quit_requested_) {
        quit_requested_ = true;
        // Deterministic smoke runs must prove CEF loaded a real page and then
        // exit without a human closing a window. Closing first exercises the
        // native browser lifecycle; the delayed quit is a guard for hidden
        // Chrome Runtime windows that do not emit OnBeforeClose promptly.
        browser->GetHost()->CloseBrowser(true);
        CefPostDelayedTask(TID_UI, new QuitMessageLoopTask(), 250);
      }
    }
  }

  void SetQuitAfterFirstMainFrameLoad(bool value) {
    quit_after_first_main_frame_load_ = value;
  }

  void SetExtensionEntryPointSmoke(std::vector<std::string> smoke_urls) {
    extension_entrypoint_smoke_ = true;
    smoke_urls_ = std::move(smoke_urls);
    next_smoke_url_index_ = 0;
  }

  void SetLocalExtensionSmoke(bool value) { local_extension_smoke_ = value; }
  void SetPhantomExtensionSmoke(bool value) { phantom_extension_smoke_ = value; }
  void SetBrowserFirstAutoOpenSidePanel(bool value) { browser_first_auto_open_side_panel_ = value; }
  void SetDefaultBrowserUrl(std::string url) { default_browser_url_ = std::move(url); }
  void SetDownloadSmoke(std::string download_url, std::filesystem::path download_dir) {
    download_smoke_ = true;
    download_url_ = std::move(download_url);
    download_dir_ = std::move(download_dir);
  }

  bool CanDownload(CefRefPtr<CefBrowser> browser,
                   const CefString& url,
                   const CefString& request_method) override {
    CEF_REQUIRE_UI_THREAD();
    (void)browser;
    std::cout << "{\"event\":\"browser.native.download_can_download\","
              << "\"url\":\"" << JsonEscape(url.ToString()) << "\","
              << "\"method\":\"" << JsonEscape(request_method.ToString()) << "\","
              << "\"allowed\":true}" << std::endl;
    return true;
  }

  bool OnBeforeDownload(CefRefPtr<CefBrowser> browser,
                        CefRefPtr<CefDownloadItem> download_item,
                        const CefString& suggested_name,
                        CefRefPtr<CefBeforeDownloadCallback> callback) override {
    CEF_REQUIRE_UI_THREAD();
    (void)browser;
    if (!download_item || !callback) {
      return false;
    }

    std::filesystem::path target_dir = download_dir_;
    if (target_dir.empty()) {
      target_dir = std::filesystem::path(std::getenv("HOME") ? std::getenv("HOME") : ".") / "Downloads";
    }
    std::filesystem::create_directories(target_dir);
    const std::string file_name = SafeDownloadFileName(
        suggested_name.ToString(),
        download_item->GetSuggestedFileName().ToString().empty() ? "resonantos-download.bin"
                                                                 : download_item->GetSuggestedFileName().ToString());
    const std::filesystem::path target_path = target_dir / file_name;
    std::cout << "{\"event\":\"browser.native.download_before\","
              << "\"id\":" << download_item->GetId() << ","
              << "\"url\":\"" << JsonEscape(download_item->GetURL().ToString()) << "\","
              << "\"path\":\"" << JsonEscape(target_path.string()) << "\"}" << std::endl;
    callback->Continue(target_path.string(), false);
    return true;
  }

  void OnDownloadUpdated(CefRefPtr<CefBrowser> browser,
                         CefRefPtr<CefDownloadItem> download_item,
                         CefRefPtr<CefDownloadItemCallback> callback) override {
    CEF_REQUIRE_UI_THREAD();
    (void)browser;
    (void)callback;
    if (!download_item || !download_item->IsValid()) {
      return;
    }
    std::cout << "{\"event\":\"browser.native.download_updated\","
              << "\"id\":" << download_item->GetId() << ","
              << "\"receivedBytes\":" << download_item->GetReceivedBytes() << ","
              << "\"totalBytes\":" << download_item->GetTotalBytes() << ","
              << "\"percent\":" << download_item->GetPercentComplete() << ","
              << "\"complete\":" << (download_item->IsComplete() ? "true" : "false") << ","
              << "\"canceled\":" << (download_item->IsCanceled() ? "true" : "false") << ","
              << "\"interrupted\":" << (download_item->IsInterrupted() ? "true" : "false") << ","
              << "\"path\":\"" << JsonEscape(download_item->GetFullPath().ToString()) << "\"}" << std::endl;
    if (download_smoke_ && !quit_requested_ &&
        (download_item->IsComplete() || download_item->IsCanceled() || download_item->IsInterrupted())) {
      quit_requested_ = true;
      CefPostDelayedTask(TID_UI, new QuitMessageLoopTask(), 250);
    }
  }

  void ExecuteNativeMenuCommand(const std::string& command) {
    CEF_REQUIRE_UI_THREAD();
    CefRefPtr<CefBrowser> browser = ActiveBrowser();
    if (command == "new_tab") {
      if (!ExecuteChromeCommandByName(browser, "IDC_NEW_TAB", CEF_WOD_NEW_FOREGROUND_TAB)) {
        OpenNewBrowserSurface();
      }
      return;
    }
    if (command == "new_window") {
      if (!ExecuteChromeCommandByName(browser, "IDC_NEW_WINDOW", CEF_WOD_NEW_WINDOW)) {
        OpenNewBrowserSurface();
      }
      return;
    }
    if (command == "close_tab") {
      if (!ExecuteChromeCommandByName(browser, "IDC_CLOSE_TAB", CEF_WOD_CURRENT_TAB) && browser) {
        browser->GetHost()->CloseBrowser(false);
      }
      return;
    }
    if (command == "close_window") {
      if (browser) {
        browser->GetHost()->CloseBrowser(false);
      }
      return;
    }
    if (!browser) {
      return;
    }
    if (command == "reload") {
      browser->Reload();
      return;
    }
    if (command == "back") {
      if (browser->CanGoBack()) {
        browser->GoBack();
      }
      return;
    }
    if (command == "forward") {
      if (browser->CanGoForward()) {
        browser->GoForward();
      }
      return;
    }
    if (command == "zoom_reset") {
      browser->GetHost()->SetZoomLevel(0.0);
      return;
    }
    if (command == "zoom_in") {
      browser->GetHost()->SetZoomLevel(browser->GetHost()->GetZoomLevel() + 0.5);
      return;
    }
    if (command == "zoom_out") {
      browser->GetHost()->SetZoomLevel(browser->GetHost()->GetZoomLevel() - 0.5);
      return;
    }
    if (command == "open_augmentor") {
      CefPostTask(TID_UI, new OpenAugmentorSidePanelTask(browser));
      return;
    }
    if (command == "new_augmentor_chat") {
      browser->GetMainFrame()->LoadURL(default_browser_url_.empty() ? kDefaultUrl : default_browser_url_);
      CefPostDelayedTask(TID_UI, new OpenAugmentorSidePanelTask(browser), 250);
      return;
    }
    if (command == "stop_agent_control") {
      SendEscapeKey(browser);
      return;
    }
    if (command == "show_history") {
      if (!ExecuteChromeCommandByName(browser, "IDC_SHOW_HISTORY", CEF_WOD_CURRENT_TAB)) {
        browser->GetMainFrame()->LoadURL("chrome://history");
      }
      return;
    }
    if (command == "bookmark_this_page") {
      ExecuteChromeCommandByName(browser, "IDC_BOOKMARK_THIS_TAB", CEF_WOD_CURRENT_TAB);
      return;
    }
    if (command == "show_bookmarks") {
      if (!ExecuteChromeCommandByName(browser, "IDC_SHOW_BOOKMARK_MANAGER", CEF_WOD_CURRENT_TAB)) {
        browser->GetMainFrame()->LoadURL("chrome://bookmarks");
      }
      return;
    }
    if (command == "manage_profiles") {
      if (!ExecuteChromeCommandByName(browser, "IDC_MANAGE_CHROME_PROFILES", CEF_WOD_CURRENT_TAB)) {
        browser->GetMainFrame()->LoadURL("chrome://settings/manageProfile");
      }
      return;
    }
    if (command == "default_profile") {
      browser->GetMainFrame()->LoadURL("chrome://settings/manageProfile");
      return;
    }
    if (command == "next_tab") {
      ExecuteChromeCommandByName(browser, "IDC_SELECT_NEXT_TAB", CEF_WOD_CURRENT_TAB);
      return;
    }
    if (command == "previous_tab") {
      ExecuteChromeCommandByName(browser, "IDC_SELECT_PREVIOUS_TAB", CEF_WOD_CURRENT_TAB);
      return;
    }
    if (command == "reopen_closed_tab") {
      ExecuteChromeCommandByName(browser, "IDC_RESTORE_TAB", CEF_WOD_CURRENT_TAB);
      return;
    }
    if (command == "help") {
      browser->GetMainFrame()->LoadURL("https://resonantos.com");
      return;
    }
    if (command == "print") {
      ExecuteChromeCommandByName(browser, "IDC_PRINT", CEF_WOD_CURRENT_TAB);
    }
  }

 private:
  void MarkKeyboardShortcut(bool* is_keyboard_shortcut) {
    if (is_keyboard_shortcut) {
      *is_keyboard_shortcut = true;
    }
  }

  void OpenNewBrowserSurface() {
    // Intent citation: docs/architecture/ADR-037-browser-first-chromium-resonantos.md
    // Browser chrome shortcuts belong to the native CEF host. We only handle
    // window lifecycle shortcuts here; page text/editing shortcuts stay native
    // Chromium behavior inside the loaded website.
    CefBrowserSettings browser_settings;
    CefWindowInfo window_info;
    window_info.runtime_style = CEF_RUNTIME_STYLE_CHROME;
    if (!CefBrowserHost::CreateBrowser(
            window_info,
            this,
            default_browser_url_.empty() ? kDefaultUrl : default_browser_url_,
            browser_settings,
            nullptr,
            CefRequestContext::GetGlobalContext())) {
      std::cerr << "Failed to create a new ResonantOS Browser window." << std::endl;
    }
  }

  CefRefPtr<CefBrowser> ActiveBrowser() {
    if (active_browser_) {
      return active_browser_;
    }
    if (!browsers_.empty()) {
      return browsers_.back();
    }
    return nullptr;
  }

  bool ExecuteChromeCommandByName(CefRefPtr<CefBrowser> browser,
                                  const char* command_id_name,
                                  cef_window_open_disposition_t disposition) {
    if (!browser) {
      return false;
    }
    const int command_id = cef_id_for_command_id_name(command_id_name);
    if (command_id <= 0 || !browser->GetHost()->CanExecuteChromeCommand(command_id)) {
      return false;
    }
    browser->GetHost()->ExecuteChromeCommand(command_id, disposition);
    return true;
  }

  void SendEscapeKey(CefRefPtr<CefBrowser> browser) {
    CefKeyEvent down;
    down.type = KEYEVENT_RAWKEYDOWN;
    down.windows_key_code = 27;
    down.native_key_code = 53;
    browser->GetHost()->SendKeyEvent(down);

    CefKeyEvent up;
    up.type = KEYEVENT_KEYUP;
    up.windows_key_code = 27;
    up.native_key_code = 53;
    browser->GetHost()->SendKeyEvent(up);
  }

  void CloseAllBrowserSurfaces() {
    if (browsers_.empty()) {
      CefQuitMessageLoop();
      return;
    }
    auto browsers = browsers_;
    for (const auto& browser : browsers) {
      if (browser) {
        browser->GetHost()->CloseBrowser(false);
      }
    }
    CefPostDelayedTask(TID_UI, new QuitMessageLoopTask(), 250);
  }

  std::vector<CefRefPtr<CefBrowser>> browsers_;
  CefRefPtr<CefBrowser> active_browser_;
  std::vector<std::string> smoke_urls_;
  std::vector<std::string> loaded_urls_;
  std::string default_browser_url_ = kDefaultUrl;
  std::string download_url_;
  std::filesystem::path download_dir_;
  bool quit_after_first_main_frame_load_ = false;
  bool quit_requested_ = false;
  bool download_smoke_ = false;
  bool download_started_ = false;
  bool extension_entrypoint_smoke_ = false;
  bool local_extension_smoke_ = false;
  bool phantom_extension_smoke_ = false;
  bool phantom_probe_scheduled_ = false;
  bool browser_first_auto_open_side_panel_ = false;
  bool browser_first_side_panel_requested_ = false;
  std::size_t next_smoke_url_index_ = 0;

  IMPLEMENT_REFCOUNTING(ResonantBrowserClient);
  DISALLOW_COPY_AND_ASSIGN(ResonantBrowserClient);
};

CefRefPtr<ResonantBrowserClient> g_browser_client;

class ExecuteNativeMenuCommandTask final : public CefTask {
 public:
  explicit ExecuteNativeMenuCommandTask(std::string command) : command_(std::move(command)) {}

  void Execute() override {
    if (g_browser_client) {
      g_browser_client->ExecuteNativeMenuCommand(command_);
    }
  }

 private:
  std::string command_;

  IMPLEMENT_REFCOUNTING(ExecuteNativeMenuCommandTask);
  DISALLOW_COPY_AND_ASSIGN(ExecuteNativeMenuCommandTask);
};

class ResonantBrowserApp final : public CefApp, public CefBrowserProcessHandler {
 public:
  ResonantBrowserApp() = default;

  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override { return this; }

  void OnBeforeCommandLineProcessing(const CefString& process_type,
                                     CefRefPtr<CefCommandLine> command_line) override {
    if (process_type.empty()) {
      const std::string extension_dir = command_line->GetSwitchValue("resonantos-extension-dir");
      std::string extension_dirs = command_line->GetSwitchValue("resonantos-extension-dirs");
      if (extension_dirs.empty()) {
        extension_dirs = extension_dir;
      }
      command_line->AppendSwitch("enable-chrome-runtime");
      command_line->AppendSwitch("disable-features=GlobalMediaControls");
      command_line->AppendSwitch("disable-gpu");
      command_line->AppendSwitch("disable-gpu-compositing");
      command_line->AppendSwitch("use-mock-keychain");
      command_line->AppendSwitchWithValue("password-store", "basic");
      const std::string requested_debug_port =
          command_line->GetSwitchValue("resonantos-remote-debugging-port");
      command_line->AppendSwitchWithValue(
          "remote-debugging-port",
          requested_debug_port.empty() ? "0" : requested_debug_port);
      if (!extension_dirs.empty()) {
        command_line->AppendSwitchWithValue("disable-extensions-except", extension_dirs);
        command_line->AppendSwitchWithValue("load-extension", extension_dirs);
      }
    }
  }

  void OnContextInitialized() override {
    CEF_REQUIRE_UI_THREAD();

    CefRefPtr<CefCommandLine> command_line = CefCommandLine::GetGlobalCommandLine();
    const bool page_smoke = command_line->HasSwitch("resonantos-smoke");
    const bool extension_entrypoint_smoke = command_line->HasSwitch("resonantos-extension-entrypoint-smoke");
    const bool local_extension_smoke = command_line->HasSwitch("resonantos-local-extension-smoke");
    const bool phantom_extension_smoke = command_line->HasSwitch("resonantos-phantom-extension-smoke");
    const bool download_smoke = command_line->HasSwitch("resonantos-download-smoke");
    const bool browser_first = command_line->HasSwitch("resonantos-browser-first");
    if (!page_smoke && !extension_entrypoint_smoke && !local_extension_smoke && !phantom_extension_smoke &&
        !download_smoke && !browser_first) {
      return;
    }

    std::string url = command_line->GetSwitchValue("url");
    if (url.empty()) {
      url = extension_entrypoint_smoke ? kChromeExtensionsUrl : kDefaultUrl;
    }

    CefRefPtr<ResonantBrowserClient> client(new ResonantBrowserClient());
    g_browser_client = client;
    client->SetDefaultBrowserUrl(url);
    if (extension_entrypoint_smoke) {
      client->SetExtensionEntryPointSmoke({kChromeWebStoreUrl});
    } else if (local_extension_smoke) {
      client->SetLocalExtensionSmoke(true);
    } else if (phantom_extension_smoke) {
      client->SetPhantomExtensionSmoke(true);
    } else if (download_smoke) {
      client->SetDownloadSmoke(
          command_line->GetSwitchValue("resonantos-download-url"),
          command_line->GetSwitchValue("resonantos-download-dir"));
    } else if (!browser_first) {
      client->SetQuitAfterFirstMainFrameLoad(true);
    } else {
      client->SetBrowserFirstAutoOpenSidePanel(true);
    }
    CefBrowserSettings browser_settings;
    CefWindowInfo window_info;
    window_info.runtime_style = CEF_RUNTIME_STYLE_CHROME;

#if defined(OS_MAC)
    window_info.hidden = !browser_first;
#endif

    if (!CefBrowserHost::CreateBrowser(
            window_info,
            client,
            url,
            browser_settings,
            nullptr,
            CefRequestContext::GetGlobalContext())) {
      std::cerr << "Failed to create CEF Chrome Runtime smoke browser." << std::endl;
      CefQuitMessageLoop();
      return;
    }

    std::cout << "{\"event\":\""
              << (extension_entrypoint_smoke   ? "browser.native.extension_entrypoint_smoke_started"
                  : local_extension_smoke       ? "browser.native.local_extension_smoke_started"
                  : phantom_extension_smoke     ? "browser.native.phantom_extension_smoke_started"
                  : download_smoke              ? "browser.native.download_smoke_started"
                  : browser_first               ? "browser.first.started"
                                                : "browser.native.smoke_started")
              << "\",\"url\":\"" << url << "\"}" << std::endl;
    if (!browser_first) {
      CefPostDelayedTask(
          TID_UI, new SmokeTimeoutTask(),
          extension_entrypoint_smoke || local_extension_smoke || phantom_extension_smoke ? 20000 : 10000);
    }
  }

 private:
  IMPLEMENT_REFCOUNTING(ResonantBrowserApp);
  DISALLOW_COPY_AND_ASSIGN(ResonantBrowserApp);
};

bool CreateEmbeddedBrowser(CefWindowHandle parent_window,
                           const NativeViewBounds& bounds,
                           const std::string& url,
                           CefRefPtr<ResonantBrowserClient> client) {
  CEF_REQUIRE_UI_THREAD();
  CefWindowInfo window_info;
  CefRect cef_bounds(bounds.x, bounds.y, bounds.width, bounds.height);
  window_info.SetAsChild(parent_window, cef_bounds);

  CefBrowserSettings browser_settings;
  CefRefPtr<CefRequestContext> request_context = CefRequestContext::GetGlobalContext();
  return CefBrowserHost::CreateBrowser(window_info, client, url, browser_settings, nullptr, request_context);
}

void PrintProbeContract() {
  std::cout
      << "{"
      << "\"hostId\":\"resonant-browser-native\","
      << "\"engineCandidate\":\"cef-chrome-runtime\","
      << "\"defaultUrl\":\"" << kDefaultUrl << "\","
      << "\"browserFirstCommand\":\"" << kBrowserFirstCommand << "\","
      << "\"commands\":["
      << "\"" << kBrowserFirstCommand << "\","
      << "\"" << kProbeCommand << "\","
      << "\"" << kBridgeProbeCommand << "\","
      << "\"" << kStartCommand << "\","
      << "\"" << kAttachSmokeCommand << "\","
      << "\"" << kAttachViewCommand << "\","
      << "\"" << kSetBoundsCommand << "\","
      << "\"" << kOpenUrlCommand << "\","
      << "\"" << kBackCommand << "\","
      << "\"" << kForwardCommand << "\","
      << "\"" << kReloadCommand << "\","
      << "\"" << kReadPageCommand << "\","
      << "\"" << kClickCommand << "\","
      << "\"" << kTypeCommand << "\","
      << "\"" << kScrollCommand << "\","
      << "\"" << kExtensionInstallCommand << "\","
      << "\"" << kExtensionListCommand << "\","
      << "\"" << kExtensionEnableCommand << "\","
      << "\"" << kExtensionPinCommand << "\","
      << "\"" << kExtensionDisableCommand << "\","
      << "\"" << kWalletConfirmationCommand << "\","
      << "\"" << kCloseCommand << "\"],"
      << "\"extensionTargets\":[\"Phantom Wallet\",\"Bitwarden\"]"
      << ",\"extensionEntryPoints\":[\"" << kChromeExtensionsUrl << "\",\"" << kChromeWebStoreUrl << "\"]"
      << "}" << std::endl;
}

}  // namespace resonantos

extern "C" void resonant_browser_native_execute_menu_command(const char* command) {
  if (!command || !*command) {
    return;
  }
  CefPostTask(TID_UI, new resonantos::ExecuteNativeMenuCommandTask(command));
}

int resonant_browser_native_cef_main(int argc, char* argv[]) {
  for (int index = 1; index < argc; ++index) {
    std::string arg = argv[index] ? argv[index] : "";
    if (arg == "--resonantos-probe-only") {
      resonantos::PrintProbeContract();
      return 0;
    }
  }

  CefMainArgs main_args(argc, argv);
  CefRefPtr<resonantos::ResonantBrowserApp> app(new resonantos::ResonantBrowserApp());
  CefRefPtr<CefCommandLine> initial_command_line = CefCommandLine::CreateCommandLine();
  initial_command_line->InitFromArgv(argc, argv);

  int exit_code = CefExecuteProcess(main_args, app, nullptr);
  if (exit_code >= 0) {
    return exit_code;
  }

  CefSettings settings;
  settings.no_sandbox = true;
#if defined(OS_MAC)
  const auto main_bundle_path = resonantos::MacMainBundlePath();
  if (!main_bundle_path.empty()) {
    CefString(&settings.main_bundle_path) = main_bundle_path.string();
    CefString(&settings.framework_dir_path) =
        (main_bundle_path / "Contents" / "Frameworks" / "Chromium Embedded Framework.framework").string();
  }
  const auto helper_path = resonantos::MacBaseHelperExecutablePath();
  if (!helper_path.empty()) {
    CefString(&settings.browser_subprocess_path) = helper_path.string();
    std::cout << "{\"event\":\"browser.native.helper_path\",\"path\":\"" << helper_path.string()
              << "\"}" << std::endl;
  }
#endif
  std::filesystem::path cache_root;
  const std::string user_data_dir = initial_command_line->GetSwitchValue("resonantos-user-data-dir");
  if (!user_data_dir.empty()) {
    cache_root = std::filesystem::path(user_data_dir);
  } else {
    std::ostringstream cache_name;
    cache_name << "resonantos-native-browser-cef-cache";
    if (initial_command_line->HasSwitch("resonantos-smoke")) {
      cache_name << "-smoke-" << getpid();
    }
    cache_root = std::filesystem::temp_directory_path() / cache_name.str();
  }
  std::filesystem::create_directories(cache_root);
  CefString(&settings.cache_path) = cache_root.string();
  CefString(&settings.root_cache_path) = cache_root.string();

  std::cout << "{\"event\":\"browser.native.cef_initialize_start\"}" << std::endl;
  if (!CefInitialize(main_args, settings, app, nullptr)) {
    std::cerr << "Failed to initialize CEF Chrome Runtime." << std::endl;
    return 1;
  }
  std::cout << "{\"event\":\"browser.native.cef_initialize_ok\"}" << std::endl;

  resonantos::PrintProbeContract();

  // The Tauri parent-window handle is supplied by the ResonantOS host through
  // browser.native.attach_view. This source intentionally refuses to create an
  // external top-level Browser window as a fallback because ADR-025 rejects
  // any product path outside the center workspace.
  CefRunMessageLoop();
  CefShutdown();
  return 0;
}
