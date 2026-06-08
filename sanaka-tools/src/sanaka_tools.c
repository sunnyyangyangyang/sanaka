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
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define SANAKA_PROTOCOL_VERSION 1
#define SANAKA_MAX_TEXT_BYTES (1024 * 1024)
#define SANAKA_POLL_INTERVAL_MS 500
#define SANAKA_RECONNECT_INTERVAL_MS 3000
#define SANAKA_HEARTBEAT_INTERVAL_MS 5000

typedef struct SanakaConfigTag {
  char host[64];
  int port;
  char session_id[128];
  int protocol_version;
} SanakaConfig;

typedef struct SanakaStateTag {
  SOCKET socket_fd;
  int connected;
  DWORD last_poll_tick;
  DWORD last_reconnect_tick;
  DWORD last_heartbeat_tick;
  char last_local_hash[16];
  char last_remote_applied_hash[16];
  SanakaConfig config;
} SanakaState;

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

static int sanaka_load_default_config(SanakaConfig *config) {
  if (config == NULL) {
    return 0;
  }
  sanaka_copy_string(config->host, sizeof(config->host), "10.0.2.2");
  config->port = 0;
  sanaka_copy_string(config->session_id, sizeof(config->session_id), "");
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
    while (*value == ' ' || *value == '\t') {
      ++value;
    }
    {
      char *end = value + strlen(value);
      while (end > value && (end[-1] == '\r' || end[-1] == '\n' || end[-1] == ' ' || end[-1] == '\t')) {
        --end;
      }
      *end = '\0';
    }

    if (strcmp(line, "host") == 0) {
      sanaka_copy_string(config->host, sizeof(config->host), value);
    } else if (strcmp(line, "port") == 0) {
      config->port = atoi(value);
    } else if (strcmp(line, "session_id") == 0) {
      sanaka_copy_string(config->session_id, sizeof(config->session_id), value);
    } else if (strcmp(line, "protocol_version") == 0) {
      config->protocol_version = atoi(value);
    }
  }

  fclose(file);
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

static int sanaka_connect(SanakaState *state) {
  struct sockaddr_in address;
  SOCKET socket_fd;

  if (state == NULL || state->config.port <= 0) {
    return 0;
  }

  socket_fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (socket_fd == INVALID_SOCKET) {
    return 0;
  }

  sanaka_zero_memory(&address, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_port = htons((u_short) state->config.port);
  address.sin_addr.s_addr = inet_addr(state->config.host);

  if (connect(socket_fd, (struct sockaddr *) &address, sizeof(address)) == SOCKET_ERROR) {
    closesocket(socket_fd);
    return 0;
  }

  state->socket_fd = socket_fd;
  state->connected = 1;
  state->last_heartbeat_tick = GetTickCount();
  return sanaka_send_hello(socket_fd, &state->config);
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
  char hash[16];
  char payload_header[512];
  int header_length;
  int text_length;

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

  text_length = (int) strlen(text_buffer);
  if (text_length >= SANAKA_MAX_TEXT_BYTES) {
    return;
  }

  header_length = sprintf(
    payload_header,
    "{\"type\":\"clipboard_push\",\"source\":\"guest\",\"hash\":\"%s\",\"text\":\"",
    hash
  );
  if (header_length <= 0) {
    return;
  }

  send(state->socket_fd, payload_header, header_length, 0);
  send(state->socket_fd, text_buffer, text_length, 0);
  send(state->socket_fd, "\"}\n", 3, 0);
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
  char buffer[2048];
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
    char *text_start = strstr(buffer, "\"text\":\"");
    char *hash_start = strstr(buffer, "\"hash\":\"");
    char text_buffer[SANAKA_MAX_TEXT_BYTES];
    char hash[16];
    char *text_end = NULL;
    char *hash_end = NULL;

    if (text_start != NULL && hash_start != NULL) {
      text_start += 8;
      text_end = strstr(text_start, "\"}");
      hash_start += 8;
      hash_end = strchr(hash_start, '"');
      if (text_end != NULL && hash_end != NULL) {
        size_t text_len = (size_t) (text_end - text_start);
        size_t hash_len = (size_t) (hash_end - hash_start);
        if (text_len < sizeof(text_buffer) && hash_len < sizeof(hash)) {
          memcpy(text_buffer, text_start, text_len);
          text_buffer[text_len] = '\0';
          memcpy(hash, hash_start, hash_len);
          hash[hash_len] = '\0';
          if (sanaka_write_clipboard_text(text_buffer)) {
            sanaka_copy_string(state->last_remote_applied_hash, sizeof(state->last_remote_applied_hash), hash);
            sanaka_copy_string(state->last_local_hash, sizeof(state->last_local_hash), hash);
          }
        }
      }
    }
  }

  return 1;
}

static int sanaka_enable_autostart(void) {
  HKEY key;
  char module_path[MAX_PATH];
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

  result = RegSetValueExA(
    key,
    "SanakaClipboard",
    0,
    REG_SZ,
    (const BYTE *) module_path,
    (DWORD) (strlen(module_path) + 1)
  );
  RegCloseKey(key);
  return result == ERROR_SUCCESS;
}

int WINAPI WinMain(HINSTANCE instance, HINSTANCE previous_instance, LPSTR command_line, int show_command) {
  WSADATA wsa_data;
  SanakaState state;
  DWORD now_tick;

  (void) instance;
  (void) previous_instance;
  (void) command_line;
  (void) show_command;

  sanaka_zero_memory(&state, sizeof(state));
  state.socket_fd = INVALID_SOCKET;
  state.last_poll_tick = GetTickCount();
  state.last_reconnect_tick = GetTickCount();
  state.last_heartbeat_tick = GetTickCount();

  if (!sanaka_load_config(&state.config)) {
    return 1;
  }

  sanaka_enable_autostart();

  if (WSAStartup(MAKEWORD(2, 2), &wsa_data) != 0) {
    return 1;
  }

  for (;;) {
    now_tick = GetTickCount();

    if (!state.connected && (now_tick - state.last_reconnect_tick >= SANAKA_RECONNECT_INTERVAL_MS)) {
      sanaka_connect(&state);
      state.last_reconnect_tick = now_tick;
    }

    if (state.connected) {
      sanaka_recv_once(&state);
      if (now_tick - state.last_poll_tick >= SANAKA_POLL_INTERVAL_MS) {
        sanaka_send_clipboard_if_changed(&state);
        state.last_poll_tick = now_tick;
      }
      sanaka_send_heartbeat_if_needed(&state, now_tick);
    }

    Sleep(50);
  }

  sanaka_disconnect(&state);
  WSACleanup();
  return 0;
}
