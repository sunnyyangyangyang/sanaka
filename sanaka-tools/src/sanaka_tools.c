/*
 * sanaka-tools
 * Win32 clipboard bridge client for Windows XP through Windows 11+
 * C89 / Win32 API only
 */

#define _WIN32_WINNT 0x0501
#define WINVER 0x0501

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <iphlpapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "shell32.lib")

#define SANAKA_PROTOCOL_VERSION 1
#define SANAKA_BOOTSTRAP_PORT 7935
#define SANAKA_MAX_TEXT_BYTES (1024 * 1024)
#define SANAKA_JSON_BUFFER 4096
#define SANAKA_POLL_INTERVAL_MS 500
#define SANAKA_RECONNECT_INTERVAL_MS 3000
#define SANAKA_HEARTBEAT_INTERVAL_MS 5000
#define SANAKA_TRAYICON_ID 1001
#define SANAKA_MENU_STATUS_ID 2001
#define SANAKA_MENU_PORT_ID 2002
#define SANAKA_MENU_EXIT_ID 2003
#define SANAKA_WM_TRAYICON (WM_APP + 1)
#define SANAKA_WM_TRAY_BALLOON (WM_APP + 2)

typedef struct SanakaConfigTag {
  char host[64];
  int bootstrap_port;
  int port;
  char session_id[128];
  char machine_mac[32];
  int protocol_version;
} SanakaConfig;

typedef struct SanakaStateTag {
  SOCKET socket_fd;
  int connected;
  int bootstrap_ready;
  DWORD last_poll_tick;
  DWORD last_reconnect_tick;
  DWORD last_heartbeat_tick;
  char last_local_hash[16];
  char last_remote_applied_hash[16];
  char current_mac[32];
  char status_text[64];
  HWND window_handle;
  NOTIFYICONDATAA tray_icon;
  HMENU tray_menu;
  HICON icon_handle;
  SanakaConfig config;
} SanakaState;

static SanakaState g_state;

static void sanaka_zero_memory(void *ptr, size_t size) {
  unsigned char *cursor = (unsigned char *) ptr;
  size_t index;
  for (index = 0; index < size; ++index) {
    cursor[index] = 0;
  }
}

static void sanaka_copy_string(char *dest, size_t dest_size, const char *src) {
  size_t index = 0;
  if (dest == NULL || dest_size == 0) {
    return;
  }
  if (src == NULL) {
    dest[0] = '\0';
    return;
  }
  while (src[index] != '\0' && index + 1 < dest_size) {
    dest[index] = src[index];
    ++index;
  }
  dest[index] = '\0';
}

static void sanaka_hash_text(const char *text, char output[16]) {
  unsigned long hash = 2166136261u;
  const unsigned char *cursor = (const unsigned char *) (text != NULL ? text : "");
  while (*cursor != 0) {
    hash ^= (unsigned long) (*cursor);
    hash *= 16777619u;
    ++cursor;
  }
  sprintf(output, "%08lx", hash);
}

static void sanaka_trim(char *value) {
  char *end = NULL;
  if (value == NULL) {
    return;
  }
  while (*value == ' ' || *value == '\t') {
    ++value;
  }
  end = value + strlen(value);
  while (end > value && (end[-1] == '\r' || end[-1] == '\n' || end[-1] == ' ' || end[-1] == '\t')) {
    --end;
  }
  *end = '\0';
}

static int sanaka_load_default_config(SanakaConfig *config) {
  if (config == NULL) {
    return 0;
  }
  sanaka_copy_string(config->host, sizeof(config->host), "10.0.2.2");
  config->bootstrap_port = SANAKA_BOOTSTRAP_PORT;
  config->port = 0;
  sanaka_copy_string(config->session_id, sizeof(config->session_id), "");
  sanaka_copy_string(config->machine_mac, sizeof(config->machine_mac), "");
  config->protocol_version = SANAKA_PROTOCOL_VERSION;
  return 1;
}

static int sanaka_load_config(SanakaConfig *config) {
  char module_path[MAX_PATH];
  char config_path[MAX_PATH];
  char *slash = NULL;
  FILE *file = NULL;
  char line[256];

  if (config == NULL) {
    return 0;
  }

  if (!sanaka_load_default_config(config)) {
    return 0;
  }

  if (GetModuleFileNameA(NULL, module_path, MAX_PATH) == 0) {
    return 0;
  }

  slash = strrchr(module_path, '\\');
  if (slash == NULL) {
    return 0;
  }
  *slash = '\0';
  strcpy(config_path, module_path);
  strcat(config_path, "\\sanaka-clipboard.ini");

  file = fopen(config_path, "r");
  if (file == NULL) {
    return 1;
  }

  while (fgets(line, sizeof(line), file) != NULL) {
    char *equals = strchr(line, '=');
    char *value = NULL;
    if (equals == NULL) {
      continue;
    }
    *equals = '\0';
    value = equals + 1;
    sanaka_trim(value);

    if (strcmp(line, "host") == 0) {
      sanaka_copy_string(config->host, sizeof(config->host), value);
    } else if (strcmp(line, "bootstrap_port") == 0) {
      config->bootstrap_port = atoi(value);
    } else if (strcmp(line, "port") == 0) {
      config->port = atoi(value);
    } else if (strcmp(line, "session_id") == 0) {
      sanaka_copy_string(config->session_id, sizeof(config->session_id), value);
    } else if (strcmp(line, "machine_mac") == 0) {
      sanaka_copy_string(config->machine_mac, sizeof(config->machine_mac), value);
    } else if (strcmp(line, "protocol_version") == 0) {
      config->protocol_version = atoi(value);
    }
  }

  fclose(file);
  return 1;
}

static int sanaka_escape_json_string(const char *source, char *dest, size_t dest_size) {
  size_t read_index = 0;
  size_t write_index = 0;
  if (source == NULL || dest == NULL || dest_size == 0) {
    return 0;
  }

  while (source[read_index] != '\0') {
    unsigned char ch = (unsigned char) source[read_index];
    if (ch == '\\' || ch == '"') {
      if (write_index + 2 >= dest_size) {
        return 0;
      }
      dest[write_index++] = '\\';
      dest[write_index++] = (char) ch;
    } else if (ch == '\r') {
      if (write_index + 2 >= dest_size) {
        return 0;
      }
      dest[write_index++] = '\\';
      dest[write_index++] = 'r';
    } else if (ch == '\n') {
      if (write_index + 2 >= dest_size) {
        return 0;
      }
      dest[write_index++] = '\\';
      dest[write_index++] = 'n';
    } else if (ch == '\t') {
      if (write_index + 2 >= dest_size) {
        return 0;
      }
      dest[write_index++] = '\\';
      dest[write_index++] = 't';
    } else {
      if (write_index + 1 >= dest_size) {
        return 0;
      }
      dest[write_index++] = (char) ch;
    }
    ++read_index;
  }

  dest[write_index] = '\0';
  return 1;
}

static void sanaka_set_status(SanakaState *state, const char *status_text) {
  if (state == NULL) {
    return;
  }
  sanaka_copy_string(state->status_text, sizeof(state->status_text), status_text);
}

static void sanaka_update_tray_tip(SanakaState *state) {
  char tip[128];
  if (state == NULL) {
    return;
  }

  sprintf(tip, "Sanaka Clipboard - %s", state->status_text[0] ? state->status_text : "连接中");
  sanaka_copy_string(state->tray_icon.szTip, sizeof(state->tray_icon.szTip), tip);
  state->tray_icon.uFlags = NIF_TIP;
  Shell_NotifyIconA(NIM_MODIFY, &state->tray_icon);
}

static void sanaka_show_balloon(SanakaState *state, const char *title, const char *message, DWORD icon) {
  if (state == NULL) {
    return;
  }

  state->tray_icon.uFlags = NIF_INFO;
  sanaka_copy_string(state->tray_icon.szInfoTitle, sizeof(state->tray_icon.szInfoTitle), title);
  sanaka_copy_string(state->tray_icon.szInfo, sizeof(state->tray_icon.szInfo), message);
  state->tray_icon.dwInfoFlags = icon;
  Shell_NotifyIconA(NIM_MODIFY, &state->tray_icon);
}

static int sanaka_detect_machine_mac(char *buffer, size_t buffer_size) {
  ULONG size = 0;
  IP_ADAPTER_INFO *adapter_info = NULL;
  IP_ADAPTER_INFO *adapter = NULL;
  DWORD result;

  if (buffer == NULL || buffer_size < 18) {
    return 0;
  }

  buffer[0] = '\0';
  result = GetAdaptersInfo(NULL, &size);
  if (result != ERROR_BUFFER_OVERFLOW || size == 0) {
    return 0;
  }

  adapter_info = (IP_ADAPTER_INFO *) malloc(size);
  if (adapter_info == NULL) {
    return 0;
  }

  result = GetAdaptersInfo(adapter_info, &size);
  if (result != ERROR_SUCCESS) {
    free(adapter_info);
    return 0;
  }

  adapter = adapter_info;
  while (adapter != NULL) {
    if (adapter->AddressLength == 6 && adapter->Type == MIB_IF_TYPE_ETHERNET && adapter->IpAddressList.IpAddress.String[0] != '\0') {
      sprintf(
        buffer,
        "%02x:%02x:%02x:%02x:%02x:%02x",
        adapter->Address[0],
        adapter->Address[1],
        adapter->Address[2],
        adapter->Address[3],
        adapter->Address[4],
        adapter->Address[5]
      );
      free(adapter_info);
      return 1;
    }
    adapter = adapter->Next;
  }

  free(adapter_info);
  return 0;
}

static int sanaka_send_all(SOCKET socket_fd, const char *buffer, int length) {
  int offset = 0;
  int sent = 0;
  if (buffer == NULL || length <= 0) {
    return 0;
  }

  while (offset < length) {
    sent = send(socket_fd, buffer + offset, length - offset, 0);
    if (sent <= 0) {
      return 0;
    }
    offset += sent;
  }

  return 1;
}

static int sanaka_connect_socket(const char *host, int port) {
  struct sockaddr_in address;
  SOCKET socket_fd;

  if (host == NULL || port <= 0) {
    return INVALID_SOCKET;
  }

  socket_fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (socket_fd == INVALID_SOCKET) {
    return INVALID_SOCKET;
  }

  sanaka_zero_memory(&address, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_port = htons((u_short) port);
  address.sin_addr.s_addr = inet_addr(host);

  if (connect(socket_fd, (struct sockaddr *) &address, sizeof(address)) == SOCKET_ERROR) {
    closesocket(socket_fd);
    return INVALID_SOCKET;
  }

  return socket_fd;
}

static int sanaka_extract_json_string(const char *json, const char *key, char *out, size_t out_size) {
  char pattern[64];
  char *start = NULL;
  char *end = NULL;
  size_t length = 0;
  if (json == NULL || key == NULL || out == NULL || out_size == 0) {
    return 0;
  }

  sprintf(pattern, "\"%s\":\"", key);
  start = strstr((char *) json, pattern);
  if (start == NULL) {
    return 0;
  }
  start += strlen(pattern);
  end = strchr(start, '"');
  if (end == NULL) {
    return 0;
  }

  length = (size_t) (end - start);
  if (length + 1 > out_size) {
    return 0;
  }
  memcpy(out, start, length);
  out[length] = '\0';
  return 1;
}

static int sanaka_extract_json_int(const char *json, const char *key, int *value) {
  char pattern[64];
  char *start = NULL;
  if (json == NULL || key == NULL || value == NULL) {
    return 0;
  }

  sprintf(pattern, "\"%s\":", key);
  start = strstr((char *) json, pattern);
  if (start == NULL) {
    return 0;
  }
  start += strlen(pattern);
  *value = atoi(start);
  return 1;
}

static int sanaka_read_line(SOCKET socket_fd, char *buffer, int buffer_size) {
  int received;
  int total = 0;
  char ch;

  if (buffer == NULL || buffer_size <= 1) {
    return 0;
  }

  while (total < buffer_size - 1) {
    received = recv(socket_fd, &ch, 1, 0);
    if (received <= 0) {
      return 0;
    }
    if (ch == '\n') {
      break;
    }
    buffer[total++] = ch;
  }

  buffer[total] = '\0';
  return total > 0;
}

static int sanaka_bootstrap(SanakaState *state) {
  SOCKET bootstrap_socket;
  char escaped_mac[64];
  char payload[256];
  char response[SANAKA_JSON_BUFFER];
  int response_port;

  if (state == NULL) {
    return 0;
  }

  if (!sanaka_detect_machine_mac(state->current_mac, sizeof(state->current_mac))) {
    sanaka_set_status(state, "连接失败");
    sanaka_update_tray_tip(state);
    return 0;
  }

  if (!sanaka_escape_json_string(state->current_mac, escaped_mac, sizeof(escaped_mac))) {
    return 0;
  }

  bootstrap_socket = sanaka_connect_socket(state->config.host, state->config.bootstrap_port);
  if (bootstrap_socket == INVALID_SOCKET) {
    sanaka_set_status(state, "连接失败");
    sanaka_update_tray_tip(state);
    return 0;
  }

  sprintf(
    payload,
    "{\"type\":\"bootstrap_request\",\"protocolVersion\":%d,\"machineMac\":\"%s\"}\n",
    state->config.protocol_version,
    escaped_mac
  );

  if (!sanaka_send_all(bootstrap_socket, payload, (int) strlen(payload))) {
    closesocket(bootstrap_socket);
    return 0;
  }

  if (!sanaka_read_line(bootstrap_socket, response, sizeof(response))) {
    closesocket(bootstrap_socket);
    return 0;
  }
  closesocket(bootstrap_socket);

  if (strstr(response, "\"type\":\"bootstrap_ack\"") == NULL) {
    sanaka_set_status(state, "连接失败");
    sanaka_update_tray_tip(state);
    sanaka_show_balloon(state, "Sanaka 增强功能程序", "连接失败", NIIF_WARNING);
    return 0;
  }

  if (!sanaka_extract_json_string(response, "sessionId", state->config.session_id, sizeof(state->config.session_id))) {
    return 0;
  }
  if (!sanaka_extract_json_int(response, "port", &response_port)) {
    return 0;
  }

  state->config.port = response_port;
  state->bootstrap_ready = 1;
  return 1;
}

static int sanaka_send_hello(SOCKET socket_fd, const SanakaConfig *config) {
  char payload[512];
  int written;

  if (config == NULL) {
    return 0;
  }

  sprintf(
    payload,
    "{\"type\":\"hello\",\"protocolVersion\":%d,\"sessionId\":\"%s\",\"clientName\":\"sanaka_clipboard\",\"clientOs\":\"windows\"}\n",
    config->protocol_version,
    config->session_id
  );

  written = send(socket_fd, payload, (int) strlen(payload), 0);
  return written > 0;
}

static int sanaka_connect_bridge(SanakaState *state) {
  SOCKET socket_fd;

  if (state == NULL || state->config.port <= 0 || state->config.session_id[0] == '\0') {
    return 0;
  }

  socket_fd = sanaka_connect_socket(state->config.host, state->config.port);
  if (socket_fd == INVALID_SOCKET) {
    return 0;
  }

  state->socket_fd = socket_fd;
  state->connected = 1;
  state->last_heartbeat_tick = GetTickCount();
  if (!sanaka_send_hello(socket_fd, &state->config)) {
    closesocket(socket_fd);
    state->socket_fd = INVALID_SOCKET;
    state->connected = 0;
    return 0;
  }

  sanaka_set_status(state, "已连接");
  sanaka_update_tray_tip(state);
  sanaka_show_balloon(state, "Sanaka 增强功能程序", "连接成功", NIIF_INFO);
  return 1;
}

static void sanaka_disconnect(SanakaState *state) {
  if (state == NULL) {
    return;
  }
  if (state->connected && state->socket_fd != INVALID_SOCKET) {
    closesocket(state->socket_fd);
  }
  state->socket_fd = INVALID_SOCKET;
  state->connected = 0;
  state->bootstrap_ready = 0;
  state->config.port = 0;
  state->config.session_id[0] = '\0';
  sanaka_set_status(state, "连接失败");
  sanaka_update_tray_tip(state);
}

static int sanaka_read_clipboard_text(char *buffer, size_t buffer_size) {
  HANDLE handle = NULL;
  WCHAR *wide_text = NULL;
  int result = 0;

  if (buffer == NULL || buffer_size == 0) {
    return 0;
  }

  buffer[0] = '\0';

  if (!OpenClipboard(NULL)) {
    return 0;
  }

  handle = GetClipboardData(CF_UNICODETEXT);
  if (handle != NULL) {
    wide_text = (WCHAR *) GlobalLock(handle);
    if (wide_text != NULL) {
      result = WideCharToMultiByte(CP_UTF8, 0, wide_text, -1, buffer, (int) buffer_size, NULL, NULL);
      GlobalUnlock(handle);
    }
  }

  CloseClipboard();
  return result > 0;
}

static int sanaka_write_clipboard_text(const char *text) {
  int wide_length;
  HGLOBAL memory = NULL;
  WCHAR *wide_buffer = NULL;

  if (text == NULL) {
    return 0;
  }

  wide_length = MultiByteToWideChar(CP_UTF8, 0, text, -1, NULL, 0);
  if (wide_length <= 0) {
    return 0;
  }

  memory = GlobalAlloc(GMEM_MOVEABLE, (SIZE_T) wide_length * sizeof(WCHAR));
  if (memory == NULL) {
    return 0;
  }

  wide_buffer = (WCHAR *) GlobalLock(memory);
  if (wide_buffer == NULL) {
    GlobalFree(memory);
    return 0;
  }

  MultiByteToWideChar(CP_UTF8, 0, text, -1, wide_buffer, wide_length);
  GlobalUnlock(memory);

  if (!OpenClipboard(NULL)) {
    GlobalFree(memory);
    return 0;
  }

  EmptyClipboard();
  if (SetClipboardData(CF_UNICODETEXT, memory) == NULL) {
    CloseClipboard();
    GlobalFree(memory);
    return 0;
  }

  CloseClipboard();
  return 1;
}

static void sanaka_send_clipboard_if_changed(SanakaState *state) {
  char text_buffer[SANAKA_MAX_TEXT_BYTES];
  char escaped_text[SANAKA_MAX_TEXT_BYTES];
  char hash[16];
  const char *payload_prefix = "{\"type\":\"clipboard_push\",\"source\":\"guest\",\"hash\":\"";
  const char *payload_middle = "\",\"text\":\"";
  const char *payload_suffix = "\"}\n";

  if (state == NULL || !state->connected) {
    return;
  }

  if (!sanaka_read_clipboard_text(text_buffer, sizeof(text_buffer))) {
    return;
  }

  sanaka_hash_text(text_buffer, hash);
  if (strcmp(hash, state->last_local_hash) == 0) {
    return;
  }
  sanaka_copy_string(state->last_local_hash, sizeof(state->last_local_hash), hash);
  if (strcmp(hash, state->last_remote_applied_hash) == 0) {
    return;
  }

  if (!sanaka_escape_json_string(text_buffer, escaped_text, sizeof(escaped_text))) {
    return;
  }

  sanaka_send_all(state->socket_fd, payload_prefix, (int) strlen(payload_prefix));
  sanaka_send_all(state->socket_fd, hash, (int) strlen(hash));
  sanaka_send_all(state->socket_fd, payload_middle, (int) strlen(payload_middle));
  sanaka_send_all(state->socket_fd, escaped_text, (int) strlen(escaped_text));
  sanaka_send_all(state->socket_fd, payload_suffix, (int) strlen(payload_suffix));
}

static void sanaka_send_heartbeat_if_needed(SanakaState *state, DWORD now_tick) {
  const char *heartbeat = "{\"type\":\"heartbeat\"}\n";
  if (state == NULL || !state->connected) {
    return;
  }
  if (now_tick - state->last_heartbeat_tick < SANAKA_HEARTBEAT_INTERVAL_MS) {
    return;
  }
  send(state->socket_fd, heartbeat, (int) strlen(heartbeat), 0);
  state->last_heartbeat_tick = now_tick;
}

static int sanaka_recv_once(SanakaState *state) {
  char buffer[SANAKA_JSON_BUFFER];
  int received;

  if (state == NULL || !state->connected) {
    return 0;
  }

  received = recv(state->socket_fd, buffer, sizeof(buffer) - 1, 0);
  if (received <= 0) {
    sanaka_disconnect(state);
    return 0;
  }

  buffer[received] = '\0';

  if (strstr(buffer, "\"type\":\"clipboard_push\"") != NULL) {
    char text_buffer[SANAKA_MAX_TEXT_BYTES];
    char hash[16];
    if (sanaka_extract_json_string(buffer, "text", text_buffer, sizeof(text_buffer))
      && sanaka_extract_json_string(buffer, "hash", hash, sizeof(hash))) {
      if (sanaka_write_clipboard_text(text_buffer)) {
        sanaka_copy_string(state->last_remote_applied_hash, sizeof(state->last_remote_applied_hash), hash);
        sanaka_copy_string(state->last_local_hash, sizeof(state->last_local_hash), hash);
      }
    }
  }

  return 1;
}

static int sanaka_enable_autostart(void) {
  HKEY key;
  char module_path[MAX_PATH + 2];
  LONG result;

  if (GetModuleFileNameA(NULL, module_path, MAX_PATH) == 0) {
    return 0;
  }

  result = RegCreateKeyExA(
    HKEY_CURRENT_USER,
    "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    0,
    NULL,
    REG_OPTION_NON_VOLATILE,
    KEY_SET_VALUE,
    NULL,
    &key,
    NULL
  );
  if (result != ERROR_SUCCESS) {
    return 0;
  }

  {
    char quoted_path[MAX_PATH + 4];
    sprintf(quoted_path, "\"%s\"", module_path);
    result = RegSetValueExA(
      key,
      "SanakaClipboard",
      0,
      REG_SZ,
      (const BYTE *) quoted_path,
      (DWORD) (strlen(quoted_path) + 1)
    );
  }

  RegCloseKey(key);
  return result == ERROR_SUCCESS;
}

static void sanaka_tray_refresh_menu(SanakaState *state) {
  char port_label[64];
  if (state == NULL || state->tray_menu == NULL) {
    return;
  }

  ModifyMenuA(state->tray_menu, SANAKA_MENU_STATUS_ID, MF_BYCOMMAND | MF_STRING | MF_GRAYED, SANAKA_MENU_STATUS_ID, state->status_text[0] ? state->status_text : "连接中");
  sprintf(port_label, "端口：%d", state->config.port > 0 ? state->config.port : state->config.bootstrap_port);
  ModifyMenuA(state->tray_menu, SANAKA_MENU_PORT_ID, MF_BYCOMMAND | MF_STRING | MF_GRAYED, SANAKA_MENU_PORT_ID, port_label);
}

static void sanaka_show_tray_menu(SanakaState *state) {
  POINT point;
  if (state == NULL || state->tray_menu == NULL || state->window_handle == NULL) {
    return;
  }

  sanaka_tray_refresh_menu(state);
  GetCursorPos(&point);
  SetForegroundWindow(state->window_handle);
  TrackPopupMenu(state->tray_menu, TPM_LEFTALIGN | TPM_RIGHTBUTTON, point.x, point.y, 0, state->window_handle, NULL);
  PostMessageA(state->window_handle, WM_NULL, 0, 0);
}

static int sanaka_initialize_tray(SanakaState *state) {
  if (state == NULL || state->window_handle == NULL) {
    return 0;
  }

  state->icon_handle = LoadIcon(NULL, IDI_APPLICATION);
  state->tray_menu = CreatePopupMenu();
  if (state->tray_menu == NULL) {
    return 0;
  }

  AppendMenuA(state->tray_menu, MF_STRING | MF_GRAYED, SANAKA_MENU_STATUS_ID, "连接中");
  AppendMenuA(state->tray_menu, MF_STRING | MF_GRAYED, SANAKA_MENU_PORT_ID, "端口：7935");
  AppendMenuA(state->tray_menu, MF_SEPARATOR, 0, NULL);
  AppendMenuA(state->tray_menu, MF_STRING, SANAKA_MENU_EXIT_ID, "退出");

  sanaka_zero_memory(&state->tray_icon, sizeof(state->tray_icon));
  state->tray_icon.cbSize = sizeof(state->tray_icon);
  state->tray_icon.hWnd = state->window_handle;
  state->tray_icon.uID = SANAKA_TRAYICON_ID;
  state->tray_icon.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
  state->tray_icon.uCallbackMessage = SANAKA_WM_TRAYICON;
  state->tray_icon.hIcon = state->icon_handle;
  sanaka_copy_string(state->tray_icon.szTip, sizeof(state->tray_icon.szTip), "Sanaka Clipboard");

  if (!Shell_NotifyIconA(NIM_ADD, &state->tray_icon)) {
    return 0;
  }

  return 1;
}

static void sanaka_cleanup_tray(SanakaState *state) {
  if (state == NULL) {
    return;
  }
  Shell_NotifyIconA(NIM_DELETE, &state->tray_icon);
  if (state->tray_menu != NULL) {
    DestroyMenu(state->tray_menu);
    state->tray_menu = NULL;
  }
}

static LRESULT CALLBACK SanakaWindowProc(HWND hwnd, UINT message, WPARAM w_param, LPARAM l_param) {
  switch (message) {
    case SANAKA_WM_TRAYICON:
      if (l_param == WM_RBUTTONUP || l_param == WM_CONTEXTMENU || l_param == WM_LBUTTONUP) {
        sanaka_show_tray_menu(&g_state);
      }
      return 0;
    case WM_COMMAND:
      if (LOWORD(w_param) == SANAKA_MENU_EXIT_ID) {
        PostQuitMessage(0);
        return 0;
      }
      break;
    case WM_DESTROY:
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProcA(hwnd, message, w_param, l_param);
}

static int sanaka_create_message_window(SanakaState *state, HINSTANCE instance) {
  WNDCLASSA window_class;
  HWND window_handle;

  sanaka_zero_memory(&window_class, sizeof(window_class));
  window_class.lpfnWndProc = SanakaWindowProc;
  window_class.hInstance = instance;
  window_class.lpszClassName = "SanakaClipboardWindow";

  if (RegisterClassA(&window_class) == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
    return 0;
  }

  window_handle = CreateWindowExA(
    0,
    "SanakaClipboardWindow",
    "Sanaka Clipboard",
    0,
    0,
    0,
    0,
    0,
    NULL,
    NULL,
    instance,
    NULL
  );

  if (window_handle == NULL) {
    return 0;
  }

  state->window_handle = window_handle;
  return 1;
}

int WINAPI WinMain(HINSTANCE instance, HINSTANCE previous_instance, LPSTR command_line, int show_command) {
  WSADATA wsa_data;
  MSG message;
  DWORD now_tick;

  (void) previous_instance;
  (void) command_line;
  (void) show_command;

  sanaka_zero_memory(&g_state, sizeof(g_state));
  g_state.socket_fd = INVALID_SOCKET;
  g_state.last_poll_tick = GetTickCount();
  g_state.last_reconnect_tick = GetTickCount();
  g_state.last_heartbeat_tick = GetTickCount();
  sanaka_set_status(&g_state, "连接中");

  if (!sanaka_load_config(&g_state.config)) {
    return 1;
  }

  sanaka_enable_autostart();

  if (WSAStartup(MAKEWORD(2, 2), &wsa_data) != 0) {
    return 1;
  }

  if (!sanaka_create_message_window(&g_state, instance)) {
    WSACleanup();
    return 1;
  }

  if (!sanaka_initialize_tray(&g_state)) {
    DestroyWindow(g_state.window_handle);
    WSACleanup();
    return 1;
  }

  while (1) {
    while (PeekMessageA(&message, NULL, 0, 0, PM_REMOVE)) {
      if (message.message == WM_QUIT) {
        sanaka_cleanup_tray(&g_state);
        sanaka_disconnect(&g_state);
        WSACleanup();
        return 0;
      }
      TranslateMessage(&message);
      DispatchMessageA(&message);
    }

    now_tick = GetTickCount();

    if (!g_state.connected && (now_tick - g_state.last_reconnect_tick >= SANAKA_RECONNECT_INTERVAL_MS)) {
      if (!g_state.bootstrap_ready) {
        sanaka_bootstrap(&g_state);
      }
      if (g_state.bootstrap_ready) {
        sanaka_connect_bridge(&g_state);
      }
      g_state.last_reconnect_tick = now_tick;
    }

    if (g_state.connected) {
      sanaka_recv_once(&g_state);
      if (now_tick - g_state.last_poll_tick >= SANAKA_POLL_INTERVAL_MS) {
        sanaka_send_clipboard_if_changed(&g_state);
        g_state.last_poll_tick = now_tick;
      }
      sanaka_send_heartbeat_if_needed(&g_state, now_tick);
    }

    Sleep(50);
  }
}
