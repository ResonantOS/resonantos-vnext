// Intent citation: docs/architecture/ADR-025-native-embedded-browser-host.md
//
// Narrow C ABI for the in-process native Browser bridge. Rust/Tauri must use
// this boundary rather than attaching an external CEF executable to a shell view.

#pragma once

#ifdef __cplusplus
extern "C" {
#endif

const char* resonant_browser_native_contract_json(void);
const char* resonant_browser_native_in_process_status_json(void);
const char* resonant_browser_native_prepare_macos_application_json(void);
const char* resonant_browser_native_initialize_json(const char* framework_dir_path,
                                                    const char* helper_executable_path,
                                                    const char* cache_dir_path);
const char* resonant_browser_native_attach_macos_ns_view_json(void* parent_ns_view,
                                                             int x,
                                                             int y,
                                                             int width,
                                                             int height,
                                                             const char* url);
const char* resonant_browser_native_resize_json(int x, int y, int width, int height);
const char* resonant_browser_native_navigate_json(const char* url);
const char* resonant_browser_native_click_json(int x, int y);
const char* resonant_browser_native_scroll_json(int x, int y, int delta_x, int delta_y);
const char* resonant_browser_native_type_text_json(const char* text);
const char* resonant_browser_native_probe_phantom_json(void);
const char* resonant_browser_native_close_json(void);
const char* resonant_browser_native_status_json(void);

#ifdef __cplusplus
}
#endif
