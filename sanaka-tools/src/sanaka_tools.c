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
#define SANAKA_MAX_TEXT_BYTES (256 * 1024)
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
  WCHAR status_text[64];
  HWND window_handle;
  char log_path[MAX_PATH];
  NOTIFYICONDATAW tray_icon;
  HMENU tray_menu;
  HICON icon_handle;
  SanakaConfig config;
} SanakaState;

static SanakaState g_state;

static const WCHAR SANAKA_STATUS_CONNECTING[] = { 0x8fde, 0x63a5, 0x4e2d, 0x0000 };
static const WCHAR SANAKA_STATUS_CONNECTED[] = { 0x5df2, 0x8fde, 0x63a5, 0x0000 };
static const WCHAR SANAKA_STATUS_FAILED[] = { 0x8fde, 0x63a5, 0x5931, 0x8d25, 0x0000 };
static const WCHAR SANAKA_PORT_PREFIX[] = { 0x7aef, 0x53e3, 0xff1a, 0x0000 };
static const WCHAR SANAKA_EXIT_LABEL[] = { 0x9000, 0x51fa, 0x0000 };
static const WCHAR SANAKA_PORT_7935_LABEL[] = { 0x7aef, 0x53e3, 0xff1a, '7', '9', '3', '5', 0x0000 };
static const WCHAR SANAKA_BALLOON_TITLE[] = { 'S','a','n','a','k','a',' ',0x5171,0x4eab,0x526a,0x8d34,0x677f,0x529f,0x80fd,0x0000 };
static const WCHAR SANAKA_BALLOON_CONNECTED[] = { 0x8fde, 0x63a5, 0x6210, 0x529f, 0x0000 };
static const WCHAR SANAKA_BALLOON_FAILED[] = { 0x8fde, 0x63a5, 0x5931, 0x8d25, 0x0000 };
static const WCHAR SANAKA_TOOLTIP_PREFIX[] = { 'S','a','n','a','k','a',' ','C','l','i','p','b','o','a','r','d',' ','-',' ',0x0000 };
static const WCHAR SANAKA_WINDOW_CLASS[] = { 'S','a','n','a','k','a','C','l','i','p','b','o','a','r','d','W','i','n','d','o','w',0x0000 };
static const WCHAR SANAKA_WINDOW_TITLE[] = { 'S','a','n','a','k','a',' ','C','l','i','p','b','o','a','r','d',0x0000 };

static void sanaka_log_line(const char *message) {
  FILE *file = NULL;
  SYSTEMTIME now;
  if (g_state.log_path[0] == '\0' || message == NULL) {
    return;
  }

  file = fopen(g_state.log_path, "a");
  if (file == NULL) {
    return;
  }

  GetLocalTime(&now);
  fprintf(
    file,
    "[%04d-%02d-%02d %02d:%02d:%02d] %s\n",
    now.wYear,
    now.wMonth,
    now.wDay,
    now.wHour,
    now.wMinute,
    now.wSecond,
    message
  );
  fclose(file);
}

static void sanaka_log_format1(const char *prefix, const char *value) {
  char line[1024];
  if (prefix == NULL) {
    return;
  }
  sprintf(line, "%s%s", prefix, value != NULL ? value : "");
  sanaka_log_line(line);
}

static void sanaka_log_format_int(const char *prefix, int value) {
  char line[256];
  if (prefix == NULL) {
    return;
  }
  sprintf(line, "%s%d", prefix, value);
  sanaka_log_line(line);
}

static void sanaka_prepare_log_path(void) {
  char module_path[MAX_PATH];
  char *slash = NULL;
  if (GetModuleFileNameA(NULL, module_path, MAX_PATH) == 0) {
    return;
  }
  slash = strrchr(module_path, '\\');
  if (slash == NULL) {
    return;
  }
  *slash = '\0';
  strcpy(g_state.log_path, module_path);
  strcat(g_state.log_path, "\\sanaka_clipboard.log");
}

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

static void sanaka_copy_wstring(WCHAR *dest, size_t dest_size, const WCHAR *src) {
  size_t index = 0;
  if (dest == NULL || dest_size == 0) {
    return;
  }
  if (src == NULL) {
    dest[0] = L'\0';
    return;
  }
  while (src[index] != L'\0' && index + 1 < dest_size) {
    dest[index] = src[index];
    ++index;
  }
  dest[index] = L'\0';
}

static void sanaka_normalize_newlines_to_lf(char *text) {
  size_t read_index = 0;
  size_t write_index = 0;
  if (text == NULL) {
    return;
  }
  while (text[read_index] != '\0') {
    if (text[read_index] == '\r') {
      text[write_index++] = '\n';
      if (text[read_index + 1] == '\n') {
        ++read_index;
      }
    } else {
      text[write_index++] = text[read_index];
    }
    ++read_index;
  }
  text[write_index] = '\0';
}

static int sanaka_normalize_newlines_to_crlf(const char *source, char *dest, size_t dest_size) {
  size_t read_index = 0;
  size_t write_index = 0;
  if (source == NULL || dest == NULL || dest_size == 0) {
    return 0;
  }
  while (source[read_index] != '\0') {
    if (source[read_index] == '\r') {
      if (write_index + 2 >= dest_size) {
        return 0;
      }
      dest[write_index++] = '\r';
      dest[write_index++] = '\n';
      if (source[read_index + 1] == '\n') {
        ++read_index;
      }
    } else if (source[read_index] == '\n') {
      if (write_index + 2 >= dest_size) {
        return 0;
      }
      dest[write_index++] = '\r';
      dest[write_index++] = '\n';
    } else {
      if (write_index + 1 >= dest_size) {
        return 0;
      }
      dest[write_index++] = source[read_index];
    }
    ++read_index;
  }
  dest[write_index] = '\0';
  return 1;
}

static int sanaka_utf16_to_utf8(const WCHAR *wide_text, char *buffer, size_t buffer_size) {
  int result;
  if (wide_text == NULL || buffer == NULL || buffer_size == 0) {
    return 0;
  }
  result = WideCharToMultiByte(CP_UTF8, 0, wide_text, -1, buffer, (int) buffer_size, NULL, NULL);
  return result > 0;
}

static int sanaka_ansi_to_utf8(const char *ansi_text, char *buffer, size_t buffer_size) {
  int wide_length;
  WCHAR *wide_buffer = NULL;
  int ok = 0;

  if (ansi_text == NULL || buffer == NULL || buffer_size == 0) {
    return 0;
  }

  wide_length = MultiByteToWideChar(CP_ACP, 0, ansi_text, -1, NULL, 0);
  if (wide_length <= 0) {
    return 0;
  }

  wide_buffer = (WCHAR *) malloc((size_t) wide_length * sizeof(WCHAR));
  if (wide_buffer == NULL) {
    return 0;
  }

  if (MultiByteToWideChar(CP_ACP, 0, ansi_text, -1, wide_buffer, wide_length) > 0) {
    ok = sanaka_utf16_to_utf8(wide_buffer, buffer, buffer_size);
  }

  free(wide_buffer);
  return ok;
}

static int sanaka_utf8_to_utf16(const char *utf8_text, WCHAR *wide_buffer, int wide_capacity) {
  int result;
  if (utf8_text == NULL || wide_buffer == NULL || wide_capacity <= 0) {
    return 0;
  }
  result = MultiByteToWideChar(CP_UTF8, 0, utf8_text, -1, wide_buffer, wide_capacity);
  return result > 0;
}

static int sanaka_utf8_to_ansi(const char *utf8_text, char *ansi_buffer, size_t ansi_capacity) {
  int wide_length;
  WCHAR *wide_buffer = NULL;
  int result;
  int ok = 0;

  if (utf8_text == NULL || ansi_buffer == NULL || ansi_capacity == 0) {
    return 0;
  }

  wide_length = MultiByteToWideChar(CP_UTF8, 0, utf8_text, -1, NULL, 0);
  if (wide_length <= 0) {
    return 0;
  }

  wide_buffer = (WCHAR *) malloc((size_t) wide_length * sizeof(WCHAR));
  if (wide_buffer == NULL) {
    return 0;
  }

  if (MultiByteToWideChar(CP_UTF8, 0, utf8_text, -1, wide_buffer, wide_length) > 0) {
    result = WideCharToMultiByte(CP_ACP, 0, wide_buffer, -1, ansi_buffer, (int) ansi_capacity, "?", NULL);
    ok = result > 0;
  }

  free(wide_buffer);
  return ok;
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
  sanaka_log_format1("config host=", config->host);
  sanaka_log_format_int("config bootstrap_port=", config->bootstrap_port);
  sanaka_log_format_int("config protocol_version=", config->protocol_version);
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

static void sanaka_set_status(SanakaState *state, const WCHAR *status_text) {
  if (state == NULL) {
    return;
  }
  sanaka_copy_wstring(state->status_text, sizeof(state->status_text) / sizeof(WCHAR), status_text);
}

static void sanaka_update_tray_tip(SanakaState *state) {
  WCHAR tip[128];
  if (state == NULL) {
    return;
  }

  wsprintfW(tip, L"%ls%ls", SANAKA_TOOLTIP_PREFIX, state->status_text[0] ? state->status_text : SANAKA_STATUS_CONNECTING);
  sanaka_copy_wstring(state->tray_icon.szTip, sizeof(state->tray_icon.szTip) / sizeof(WCHAR), tip);
  state->tray_icon.uFlags = NIF_TIP;
  Shell_NotifyIconW(NIM_MODIFY, &state->tray_icon);
}

static void sanaka_show_balloon(SanakaState *state, const WCHAR *title, const WCHAR *message, DWORD icon) {
  if (state == NULL) {
    return;
  }

  state->tray_icon.uFlags = NIF_INFO;
  sanaka_copy_wstring(state->tray_icon.szInfoTitle, sizeof(state->tray_icon.szInfoTitle) / sizeof(WCHAR), title);
  sanaka_copy_wstring(state->tray_icon.szInfo, sizeof(state->tray_icon.szInfo) / sizeof(WCHAR), message);
  state->tray_icon.dwInfoFlags = icon;
  Shell_NotifyIconW(NIM_MODIFY, &state->tray_icon);
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
    sanaka_log_format_int("GetAdaptersInfo preflight failed, result=", (int) result);
    return 0;
  }

  adapter_info = (IP_ADAPTER_INFO *) malloc(size);
  if (adapter_info == NULL) {
    return 0;
  }

  result = GetAdaptersInfo(adapter_info, &size);
  if (result != ERROR_SUCCESS) {
    sanaka_log_format_int("GetAdaptersInfo failed, result=", (int) result);
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
      sanaka_log_format1("detected machine mac=", buffer);
      free(adapter_info);
      return 1;
    }
    adapter = adapter->Next;
  }

  sanaka_log_line("no suitable ethernet adapter with IP address was found");
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
    sanaka_log_format1("socket connect failed host=", host);
    sanaka_log_format_int("socket connect failed port=", port);
    sanaka_log_format_int("socket connect WSA error=", (int) WSAGetLastError());
    closesocket(socket_fd);
    return INVALID_SOCKET;
  }

  sanaka_log_format1("socket connect ok host=", host);
  sanaka_log_format_int("socket connect ok port=", port);
  return socket_fd;
}

static int sanaka_extract_json_string(const char *json, const char *key, char *out, size_t out_size) {
  char pattern[64];
  const char *start = NULL;
  const char *cursor = NULL;
  size_t out_index = 0;
  if (json == NULL || key == NULL || out == NULL || out_size == 0) {
    return 0;
  }

  sprintf(pattern, "\"%s\":\"", key);
  start = strstr(json, pattern);
  if (start == NULL) {
    return 0;
  }
  start += strlen(pattern);
  cursor = start;

  while (*cursor != '\0' && *cursor != '"') {
    if (*cursor == '\\') {
      cursor++;
      if (*cursor == '\0') {
        return 0;
      }
      if (out_index + 1 >= out_size) {
        return 0;
      }
      if (*cursor == 'n') {
        out[out_index++] = '\n';
      } else if (*cursor == 'r') {
        out[out_index++] = '\r';
      } else if (*cursor == 't') {
        out[out_index++] = '\t';
      } else if (*cursor == '"' || *cursor == '\\' || *cursor == '/') {
        out[out_index++] = *cursor;
      } else {
        return 0;
      }
      cursor++;
      continue;
    }

    if (out_index + 1 >= out_size) {
      return 0;
    }
    out[out_index++] = *cursor++;
  }

  if (*cursor != '"') {
    return 0;
  }

  out[out_index] = '\0';
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
    sanaka_log_line("bootstrap aborted: failed to detect machine mac");
    sanaka_set_status(state, SANAKA_STATUS_FAILED);
    sanaka_update_tray_tip(state);
    return 0;
  }

  if (!sanaka_escape_json_string(state->current_mac, escaped_mac, sizeof(escaped_mac))) {
    sanaka_log_line("bootstrap aborted: failed to escape machine mac");
    return 0;
  }

  bootstrap_socket = sanaka_connect_socket(state->config.host, state->config.bootstrap_port);
  if (bootstrap_socket == INVALID_SOCKET) {
    sanaka_set_status(state, SANAKA_STATUS_FAILED);
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
    sanaka_log_line("bootstrap send failed");
    closesocket(bootstrap_socket);
    return 0;
  }
  sanaka_log_format1("bootstrap request sent mac=", state->current_mac);

  if (!sanaka_read_line(bootstrap_socket, response, sizeof(response))) {
    sanaka_log_line("bootstrap read failed");
    closesocket(bootstrap_socket);
    return 0;
  }
  closesocket(bootstrap_socket);
  sanaka_log_format1("bootstrap response=", response);

  if (strstr(response, "\"type\":\"bootstrap_ack\"") == NULL) {
    sanaka_log_line("bootstrap did not return ack");
    sanaka_set_status(state, SANAKA_STATUS_FAILED);
    sanaka_update_tray_tip(state);
    sanaka_show_balloon(state, SANAKA_BALLOON_TITLE, SANAKA_BALLOON_FAILED, NIIF_WARNING);
    return 0;
  }

  if (!sanaka_extract_json_string(response, "sessionId", state->config.session_id, sizeof(state->config.session_id))) {
    sanaka_log_line("bootstrap ack missing sessionId");
    return 0;
  }
  if (!sanaka_extract_json_int(response, "port", &response_port)) {
    sanaka_log_line("bootstrap ack missing port");
    return 0;
  }

  state->config.port = response_port;
  state->bootstrap_ready = 1;
  sanaka_log_format1("bootstrap sessionId=", state->config.session_id);
  sanaka_log_format_int("bootstrap assigned port=", state->config.port);
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
    sanaka_log_line("bridge connect skipped: port/session not ready");
    return 0;
  }

  socket_fd = sanaka_connect_socket(state->config.host, state->config.port);
  if (socket_fd == INVALID_SOCKET) {
    sanaka_log_line("bridge socket connect failed");
    return 0;
  }

  state->socket_fd = socket_fd;
  state->connected = 1;
  state->last_heartbeat_tick = GetTickCount();
  if (!sanaka_send_hello(socket_fd, &state->config)) {
    sanaka_log_line("bridge hello send failed");
    closesocket(socket_fd);
    state->socket_fd = INVALID_SOCKET;
    state->connected = 0;
    return 0;
  }

  sanaka_log_line("bridge connected and hello sent");
  sanaka_set_status(state, SANAKA_STATUS_CONNECTED);
  sanaka_update_tray_tip(state);
  sanaka_show_balloon(state, SANAKA_BALLOON_TITLE, SANAKA_BALLOON_CONNECTED, NIIF_INFO);
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
  sanaka_log_line("bridge disconnected");
  sanaka_set_status(state, SANAKA_STATUS_FAILED);
  sanaka_update_tray_tip(state);
}

static int sanaka_read_clipboard_text(char *buffer, size_t buffer_size) {
  HANDLE handle = NULL;
  WCHAR *wide_text = NULL;
  char *ansi_text = NULL;
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
      result = sanaka_utf16_to_utf8(wide_text, buffer, buffer_size);
      GlobalUnlock(handle);
    }
  }

  if (!result) {
    handle = GetClipboardData(CF_TEXT);
    if (handle != NULL) {
      ansi_text = (char *) GlobalLock(handle);
      if (ansi_text != NULL) {
        result = sanaka_ansi_to_utf8(ansi_text, buffer, buffer_size);
        GlobalUnlock(handle);
      }
    }
  }

  CloseClipboard();
  if (result) {
    sanaka_normalize_newlines_to_lf(buffer);
  }
  return result;
}

static int sanaka_write_clipboard_text(const char *text) {
  int wide_length;
  size_t normalized_length;
  size_t ansi_length;
  HGLOBAL memory = NULL;
  HGLOBAL ansi_memory = NULL;
  WCHAR *wide_buffer = NULL;
  char *ansi_buffer = NULL;
  char *normalized_text = NULL;
  int ok = 0;

  if (text == NULL) {
    return 0;
  }

  normalized_length = strlen(text) * 2 + 2;
  normalized_text = (char *) malloc(normalized_length);
  if (normalized_text == NULL) {
    return 0;
  }
  if (!sanaka_normalize_newlines_to_crlf(text, normalized_text, normalized_length)) {
    free(normalized_text);
    return 0;
  }

  wide_length = MultiByteToWideChar(CP_UTF8, 0, normalized_text, -1, NULL, 0);
  if (wide_length <= 0) {
    free(normalized_text);
    return 0;
  }

  memory = GlobalAlloc(GMEM_MOVEABLE, (SIZE_T) wide_length * sizeof(WCHAR));
  if (memory == NULL) {
    free(normalized_text);
    return 0;
  }

  wide_buffer = (WCHAR *) GlobalLock(memory);
  if (wide_buffer == NULL) {
    GlobalFree(memory);
    return 0;
  }

  if (!sanaka_utf8_to_utf16(normalized_text, wide_buffer, wide_length)) {
    GlobalUnlock(memory);
    GlobalFree(memory);
    free(normalized_text);
    return 0;
  }
  GlobalUnlock(memory);

  ansi_length = strlen(normalized_text) * 2 + 2;
  ansi_memory = GlobalAlloc(GMEM_MOVEABLE, ansi_length);
  if (ansi_memory != NULL) {
    ansi_buffer = (char *) GlobalLock(ansi_memory);
    if (ansi_buffer != NULL) {
      if (!sanaka_utf8_to_ansi(normalized_text, ansi_buffer, ansi_length)) {
        ansi_buffer[0] = '\0';
      }
      GlobalUnlock(ansi_memory);
    } else {
      GlobalFree(ansi_memory);
      ansi_memory = NULL;
    }
  }

  if (!OpenClipboard(NULL)) {
    GlobalFree(memory);
    if (ansi_memory != NULL) {
      GlobalFree(ansi_memory);
    }
    free(normalized_text);
    return 0;
  }

  EmptyClipboard();
  if (SetClipboardData(CF_UNICODETEXT, memory) == NULL) {
    sanaka_log_line("failed to write CF_UNICODETEXT");
    CloseClipboard();
    GlobalFree(memory);
    if (ansi_memory != NULL) {
      GlobalFree(ansi_memory);
    }
    return 0;
  }
  memory = NULL;

  if (ansi_memory != NULL) {
    if (SetClipboardData(CF_TEXT, ansi_memory) == NULL) {
      GlobalFree(ansi_memory);
    } else {
      ansi_memory = NULL;
    }
  }

  CloseClipboard();
  ok = 1;

  if (memory != NULL) {
    GlobalFree(memory);
  }
  if (ansi_memory != NULL) {
    GlobalFree(ansi_memory);
  }
  if (normalized_text != NULL) {
    free(normalized_text);
  }
  return ok;
}

static void sanaka_send_clipboard_if_changed(SanakaState *state) {
  char *text_buffer = NULL;
  char *escaped_text = NULL;
  char hash[16];
  const char *payload_prefix = "{\"type\":\"clipboard_push\",\"source\":\"guest\",\"hash\":\"";
  const char *payload_middle = "\",\"text\":\"";
  const char *payload_suffix = "\"}\n";

  if (state == NULL || !state->connected) {
    return;
  }

  text_buffer = (char *) malloc(SANAKA_MAX_TEXT_BYTES);
  escaped_text = (char *) malloc(SANAKA_MAX_TEXT_BYTES);
  if (text_buffer == NULL || escaped_text == NULL) {
    sanaka_log_line("clipboard send skipped: memory allocation failed");
    if (text_buffer != NULL) {
      free(text_buffer);
    }
    if (escaped_text != NULL) {
      free(escaped_text);
    }
    return;
  }

  if (!sanaka_read_clipboard_text(text_buffer, SANAKA_MAX_TEXT_BYTES)) {
    free(text_buffer);
    free(escaped_text);
    return;
  }

  sanaka_hash_text(text_buffer, hash);
  if (strcmp(hash, state->last_local_hash) == 0) {
    return;
  }
  sanaka_copy_string(state->last_local_hash, sizeof(state->last_local_hash), hash);
  if (strcmp(hash, state->last_remote_applied_hash) == 0) {
    free(text_buffer);
    free(escaped_text);
    return;
  }

  if (!sanaka_escape_json_string(text_buffer, escaped_text, SANAKA_MAX_TEXT_BYTES)) {
    free(text_buffer);
    free(escaped_text);
    return;
  }

  sanaka_send_all(state->socket_fd, payload_prefix, (int) strlen(payload_prefix));
  sanaka_send_all(state->socket_fd, hash, (int) strlen(hash));
  sanaka_send_all(state->socket_fd, payload_middle, (int) strlen(payload_middle));
  sanaka_send_all(state->socket_fd, escaped_text, (int) strlen(escaped_text));
  sanaka_send_all(state->socket_fd, payload_suffix, (int) strlen(payload_suffix));
  free(text_buffer);
  free(escaped_text);
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
    sanaka_log_format_int("bridge recv failed, code=", received);
    sanaka_log_format_int("bridge recv WSA error=", (int) WSAGetLastError());
    sanaka_disconnect(state);
    return 0;
  }

  buffer[received] = '\0';

  if (strstr(buffer, "\"type\":\"clipboard_push\"") != NULL) {
    char *text_buffer = NULL;
    char hash[16];
    text_buffer = (char *) malloc(SANAKA_MAX_TEXT_BYTES);
    if (text_buffer == NULL) {
      sanaka_log_line("clipboard receive skipped: memory allocation failed");
      return 1;
    }
    if (sanaka_extract_json_string(buffer, "text", text_buffer, SANAKA_MAX_TEXT_BYTES)
      && sanaka_extract_json_string(buffer, "hash", hash, sizeof(hash))) {
      if (sanaka_write_clipboard_text(text_buffer)) {
        sanaka_log_line("clipboard_push applied to local clipboard");
        sanaka_copy_string(state->last_remote_applied_hash, sizeof(state->last_remote_applied_hash), hash);
        sanaka_copy_string(state->last_local_hash, sizeof(state->last_local_hash), hash);
      }
    }
    free(text_buffer);
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
  WCHAR port_label[64];
  if (state == NULL || state->tray_menu == NULL) {
    return;
  }

  ModifyMenuW(state->tray_menu, SANAKA_MENU_STATUS_ID, MF_BYCOMMAND | MF_STRING | MF_GRAYED, SANAKA_MENU_STATUS_ID, state->status_text[0] ? state->status_text : SANAKA_STATUS_CONNECTING);
  wsprintfW(port_label, L"%ls%d", SANAKA_PORT_PREFIX, state->config.port > 0 ? state->config.port : state->config.bootstrap_port);
  ModifyMenuW(state->tray_menu, SANAKA_MENU_PORT_ID, MF_BYCOMMAND | MF_STRING | MF_GRAYED, SANAKA_MENU_PORT_ID, port_label);
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
  PostMessageW(state->window_handle, WM_NULL, 0, 0);
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

  AppendMenuW(state->tray_menu, MF_STRING | MF_GRAYED, SANAKA_MENU_STATUS_ID, SANAKA_STATUS_CONNECTING);
  AppendMenuW(state->tray_menu, MF_STRING | MF_GRAYED, SANAKA_MENU_PORT_ID, SANAKA_PORT_7935_LABEL);
  AppendMenuW(state->tray_menu, MF_SEPARATOR, 0, NULL);
  AppendMenuW(state->tray_menu, MF_STRING, SANAKA_MENU_EXIT_ID, SANAKA_EXIT_LABEL);

  sanaka_zero_memory(&state->tray_icon, sizeof(state->tray_icon));
  state->tray_icon.cbSize = sizeof(state->tray_icon);
  state->tray_icon.hWnd = state->window_handle;
  state->tray_icon.uID = SANAKA_TRAYICON_ID;
  state->tray_icon.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
  state->tray_icon.uCallbackMessage = SANAKA_WM_TRAYICON;
  state->tray_icon.hIcon = state->icon_handle;
  sanaka_copy_wstring(state->tray_icon.szTip, sizeof(state->tray_icon.szTip) / sizeof(WCHAR), L"Sanaka Clipboard");

  if (!Shell_NotifyIconW(NIM_ADD, &state->tray_icon)) {
    return 0;
  }

  return 1;
}

static void sanaka_cleanup_tray(SanakaState *state) {
  if (state == NULL) {
    return;
  }
  Shell_NotifyIconW(NIM_DELETE, &state->tray_icon);
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
  return DefWindowProcW(hwnd, message, w_param, l_param);
}

static int sanaka_create_message_window(SanakaState *state, HINSTANCE instance) {
  WNDCLASSW window_class;
  HWND window_handle;

  sanaka_zero_memory(&window_class, sizeof(window_class));
  window_class.lpfnWndProc = SanakaWindowProc;
  window_class.hInstance = instance;
  window_class.lpszClassName = SANAKA_WINDOW_CLASS;

  if (RegisterClassW(&window_class) == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
    return 0;
  }

  window_handle = CreateWindowExW(
    0,
    SANAKA_WINDOW_CLASS,
    SANAKA_WINDOW_TITLE,
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
  sanaka_prepare_log_path();
  sanaka_log_line("sanaka_clipboard start");
  g_state.socket_fd = INVALID_SOCKET;
  g_state.last_poll_tick = GetTickCount();
  g_state.last_reconnect_tick = GetTickCount();
  g_state.last_heartbeat_tick = GetTickCount();
  sanaka_set_status(&g_state, SANAKA_STATUS_CONNECTING);

  if (!sanaka_load_config(&g_state.config)) {
    sanaka_log_line("failed to load config");
    return 1;
  }

  sanaka_enable_autostart();
  sanaka_log_line("autostart ensured");

  if (WSAStartup(MAKEWORD(2, 2), &wsa_data) != 0) {
    sanaka_log_line("WSAStartup failed");
    return 1;
  }
  sanaka_log_line("WSAStartup ok");

  if (!sanaka_create_message_window(&g_state, instance)) {
    sanaka_log_line("failed to create message window");
    WSACleanup();
    return 1;
  }
  sanaka_log_line("message window created");

  if (!sanaka_initialize_tray(&g_state)) {
    sanaka_log_line("failed to initialize tray");
    DestroyWindow(g_state.window_handle);
    WSACleanup();
    return 1;
  }
  sanaka_log_line("tray initialized");

  while (1) {
    while (PeekMessageW(&message, NULL, 0, 0, PM_REMOVE)) {
      if (message.message == WM_QUIT) {
        sanaka_log_line("received WM_QUIT");
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
      sanaka_log_line("reconnect tick");
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
