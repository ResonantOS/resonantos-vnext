cmake_minimum_required(VERSION 3.21)

project(ResonantBrowserNativeHost LANGUAGES CXX OBJCXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED CEF_ROOT)
  message(FATAL_ERROR "CEF_ROOT must point to a Chromium Embedded Framework binary distribution.")
endif()

list(APPEND CMAKE_MODULE_PATH "${CEF_ROOT}/cmake")
find_package(CEF REQUIRED)

add_subdirectory(${CEF_LIBCEF_DLL_WRAPPER_PATH} libcef_dll_wrapper)

if(NOT OS_MAC)
  ADD_LOGICAL_TARGET("libcef_lib" "${CEF_LIB_DEBUG}" "${CEF_LIB_RELEASE}")
endif()

if(APPLE)
  add_executable(ResonantBrowserNativeHost
    src/resonant_browser_native_host.cc
    src/resonant_browser_native_host_mac.mm
  )
else()
  add_executable(ResonantBrowserNativeHost
    src/resonant_browser_native_host.cc
  )
endif()

add_library(ResonantBrowserNativeBridge STATIC
  src/resonant_browser_native_bridge.cc
)

if(APPLE)
  add_library(ResonantBrowserNativeBridgeShared SHARED
    src/resonant_browser_native_bridge.cc
    src/resonant_browser_native_bridge_mac.mm
  )
else()
  add_library(ResonantBrowserNativeBridgeShared SHARED
    src/resonant_browser_native_bridge.cc
  )
endif()

SET_EXECUTABLE_TARGET_PROPERTIES(ResonantBrowserNativeHost)

target_include_directories(ResonantBrowserNativeHost PRIVATE
  "${CEF_ROOT}"
)

target_include_directories(ResonantBrowserNativeBridge PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}/include"
)

target_include_directories(ResonantBrowserNativeBridgeShared PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}/include"
)

target_include_directories(ResonantBrowserNativeBridgeShared PRIVATE
  "${CEF_ROOT}"
)

if(OS_MAC)
  target_link_libraries(ResonantBrowserNativeHost PRIVATE libcef_dll_wrapper ${CEF_STANDARD_LIBS})
  target_link_libraries(ResonantBrowserNativeBridgeShared PRIVATE libcef_dll_wrapper ${CEF_STANDARD_LIBS})
else()
  target_link_libraries(ResonantBrowserNativeHost PRIVATE libcef_lib libcef_dll_wrapper ${CEF_STANDARD_LIBS})
  target_link_libraries(ResonantBrowserNativeBridgeShared PRIVATE libcef_lib libcef_dll_wrapper ${CEF_STANDARD_LIBS})
endif()

add_dependencies(ResonantBrowserNativeHost libcef_dll_wrapper)
add_dependencies(ResonantBrowserNativeBridgeShared libcef_dll_wrapper)

target_compile_definitions(ResonantBrowserNativeHost PRIVATE
  RESONANT_BROWSER_NATIVE_HOST=1
)

target_compile_definitions(ResonantBrowserNativeBridge PRIVATE
  RESONANT_BROWSER_NATIVE_BRIDGE=1
)

target_compile_definitions(ResonantBrowserNativeBridgeShared PRIVATE
  RESONANT_BROWSER_NATIVE_BRIDGE=1
)

if(APPLE)
  set_target_properties(ResonantBrowserNativeHost PROPERTIES
    MACOSX_BUNDLE TRUE
    MACOSX_BUNDLE_BUNDLE_NAME "Resonant Browser Native Host"
    MACOSX_BUNDLE_GUI_IDENTIFIER "com.resonantos.browser.native-host"
    MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/mac/Info.plist.in"
  )
  set(RESONANT_BROWSER_NATIVE_APP "${CMAKE_CURRENT_BINARY_DIR}/ResonantBrowserNativeHost.app")
  COPY_MAC_FRAMEWORK("ResonantBrowserNativeHost" "${CEF_BINARY_DIR}" "${RESONANT_BROWSER_NATIVE_APP}")

  set(RESONANT_BROWSER_NATIVE_HELPER_SOURCE "${CEF_ROOT}/tests/cefsimple/process_helper_mac.cc")
  set(RESONANT_BROWSER_NATIVE_HELPER_TARGET "ResonantBrowserNativeHost_Helper")
  set(RESONANT_BROWSER_NATIVE_HELPER_OUTPUT_NAME "ResonantBrowserNativeHost Helper")

  foreach(_suffix_list ${CEF_HELPER_APP_SUFFIXES})
    string(REPLACE ":" ";" _suffix_list ${_suffix_list})
    list(GET _suffix_list 0 _name_suffix)
    list(GET _suffix_list 1 _target_suffix)
    list(GET _suffix_list 2 _plist_suffix)

    set(_helper_target "${RESONANT_BROWSER_NATIVE_HELPER_TARGET}${_target_suffix}")
    set(_helper_output_name "${RESONANT_BROWSER_NATIVE_HELPER_OUTPUT_NAME}${_name_suffix}")
    set(_helper_info_plist "${CMAKE_CURRENT_BINARY_DIR}/helper-Info${_target_suffix}.plist")

    file(READ "${CMAKE_CURRENT_SOURCE_DIR}/mac/helper-Info.plist.in" _plist_contents)
    string(REPLACE "\${EXECUTABLE_NAME}" "${_helper_output_name}" _plist_contents ${_plist_contents})
    string(REPLACE "\${PRODUCT_NAME}" "${_helper_output_name}" _plist_contents ${_plist_contents})
    string(REPLACE "\${BUNDLE_ID_SUFFIX}" "${_plist_suffix}" _plist_contents ${_plist_contents})
    file(WRITE ${_helper_info_plist} ${_plist_contents})

    add_executable(${_helper_target} MACOSX_BUNDLE ${RESONANT_BROWSER_NATIVE_HELPER_SOURCE})
    SET_EXECUTABLE_TARGET_PROPERTIES(${_helper_target})
    add_dependencies(${_helper_target} libcef_dll_wrapper)
    target_include_directories(${_helper_target} PRIVATE "${CEF_ROOT}")
    target_link_libraries(${_helper_target} PRIVATE libcef_dll_wrapper ${CEF_STANDARD_LIBS})
    set_target_properties(${_helper_target} PROPERTIES
      MACOSX_BUNDLE_INFO_PLIST ${_helper_info_plist}
      OUTPUT_NAME ${_helper_output_name}
    )

    add_dependencies(ResonantBrowserNativeHost "${_helper_target}")
    add_custom_command(
      TARGET ResonantBrowserNativeHost
      POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E copy_directory
              "${CMAKE_CURRENT_BINARY_DIR}/${_helper_output_name}.app"
              "${RESONANT_BROWSER_NATIVE_APP}/Contents/Frameworks/${_helper_output_name}.app"
      VERBATIM
    )
  endforeach()
endif()
