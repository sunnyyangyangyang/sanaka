#define _POSIX_C_SOURCE 200809L

#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <netdb.h>
#include <signal.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/ioctl.h>
#include <time.h>
#include <unistd.h>
#include <fcntl.h>

#define SANAKA_PROTOCOL_VERSION 1
#define SANAKA_BOOTSTRAP_PORT 7935
#define SANAKA_MAX_TEXT_BYTES (256 * 1024)
#define SANAKA_JSON_BUFFER 8192
#define SANAKA_POLL_INTERVAL_MS 500
#define SANAKA_RECONNECT_INTERVAL_MS 3000
#define SANAKA_HEARTBEAT_INTERVAL_MS 5000

typedef struct SanakaConfigTag {
  char host[64];
  int bootstrap_port;
  int port;
  char session_id[128];
  char machine_mac[32];
  int protocol_version;
} SanakaConfig;

typedef struct SanakaStateTag {
  int socket_fd;
  int connected;
  int bootstrap_ready;
  long last_poll_ms;
  long last_reconnect_ms;
  long last_heartbeat_ms;
  char last_local_hash[16];
  char last_remote_applied_hash[16];
  char current_mac[32];
  char runtime_dir[1024];
  char log_path[1024];
  char read_backend_name[64];
  char write_backend_name[128];
  char active_tty_path[256];
  SanakaConfig config;
} SanakaState;

static SanakaState g_state;
static volatile sig_atomic_t g_should_exit = 0;

static void sanaka_sleep_ms(long milliseconds) {
  struct timespec request;
  if (milliseconds <= 0) {
    return;
  }
  request.tv_sec = milliseconds / 1000L;
  request.tv_nsec = (milliseconds % 1000L) * 1000000L;
  nanosleep(&request, NULL);
}

static long sanaka_now_ms(void) {
  struct timespec ts;
  if (clock_gettime(CLOCK_REALTIME, &ts) != 0) {
    return 0;
  }
  return (long) (ts.tv_sec * 1000L + ts.tv_nsec / 1000000L);
}

static void sanaka_trim(char *value) {
  size_t start = 0;
  size_t end;
  size_t index = 0;
  if (value == NULL) {
    return;
  }
  while (value[start] != '\0' && isspace((unsigned char) value[start])) {
    start++;
  }
  end = strlen(value);
  while (end > start && isspace((unsigned char) value[end - 1])) {
    end--;
  }
  while (start < end) {
    value[index++] = value[start++];
  }
  value[index] = '\0';
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
    index++;
  }
  dest[index] = '\0';
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

static int sanaka_file_exists(const char *file_path) {
  return file_path != NULL && access(file_path, F_OK) == 0;
}

static int sanaka_is_executable(const char *file_path) {
  return file_path != NULL && access(file_path, X_OK) == 0;
}

static int sanaka_command_exists(const char *command_name) {
  const char *path_env;
  char buffer[1024];
  const char *cursor;
  const char *segment_start;
  size_t segment_length;

  if (command_name == NULL || command_name[0] == '\0') {
    return 0;
  }
  if (strchr(command_name, '/') != NULL) {
    return sanaka_is_executable(command_name);
  }

  path_env = getenv("PATH");
  if (path_env == NULL || path_env[0] == '\0') {
    return 0;
  }

  cursor = path_env;
  segment_start = cursor;
  while (1) {
    if (*cursor == ':' || *cursor == '\0') {
      segment_length = (size_t) (cursor - segment_start);
      if (segment_length == 0) {
        segment_start = ".";
        segment_length = 1;
      }
      if (segment_length + 1 + strlen(command_name) + 1 < sizeof(buffer)) {
        memcpy(buffer, segment_start, segment_length);
        buffer[segment_length] = '/';
        strcpy(buffer + segment_length + 1, command_name);
        if (sanaka_is_executable(buffer)) {
          return 1;
        }
      }
      if (*cursor == '\0') {
        break;
      }
      segment_start = cursor + 1;
    }
    cursor++;
  }
  return 0;
}

static void sanaka_prepare_paths(SanakaState *state) {
  const char *home = getenv("HOME");
  if (state == NULL || home == NULL) {
    return;
  }
  if (snprintf(state->runtime_dir, sizeof(state->runtime_dir), "%s/.local/share/sanaka-tools", home) >= (int) sizeof(state->runtime_dir)) {
    state->runtime_dir[0] = '\0';
    return;
  }
  if (snprintf(state->log_path, sizeof(state->log_path), "%s/logs/sanaka-clipboard.log", state->runtime_dir) >= (int) sizeof(state->log_path)) {
    state->log_path[0] = '\0';
  }
}

static void sanaka_ensure_parent_dirs(const char *file_path) {
  char buffer[1024];
  char *cursor;
  if (file_path == NULL) {
    return;
  }
  sanaka_copy_string(buffer, sizeof(buffer), file_path);
  cursor = strrchr(buffer, '/');
  if (cursor == NULL) {
    return;
  }
  *cursor = '\0';
  cursor = buffer + 1;
  while (*cursor != '\0') {
    if (*cursor == '/') {
      *cursor = '\0';
      mkdir(buffer, 0755);
      *cursor = '/';
    }
    cursor++;
  }
  mkdir(buffer, 0755);
}

static void sanaka_log_line(const char *format, ...) {
  FILE *file;
  time_t now;
  struct tm local_tm;
  char timestamp[64];
  va_list args;

  if (g_state.log_path[0] == '\0') {
    return;
  }

  sanaka_ensure_parent_dirs(g_state.log_path);
  file = fopen(g_state.log_path, "a");
  if (file == NULL) {
    return;
  }

  now = time(NULL);
  localtime_r(&now, &local_tm);
  strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", &local_tm);

  fprintf(file, "[%s] ", timestamp);
  va_start(args, format);
  vfprintf(file, format, args);
  va_end(args);
  fputc('\n', file);
  fclose(file);
}

static int sanaka_has_wayland_session(void) {
  return getenv("WAYLAND_DISPLAY") != NULL || getenv("WAYLAND_SOCKET") != NULL;
}

static int sanaka_has_x11_session(void) {
  return getenv("DISPLAY") != NULL;
}

static int sanaka_detect_active_tty(char *buffer, size_t buffer_size) {
  FILE *file;
  char tty_name[128];
  const char *tty_env;
  char *resolved;

  if (buffer == NULL || buffer_size == 0) {
    return 0;
  }
  buffer[0] = '\0';

  file = fopen("/sys/class/tty/tty0/active", "r");
  if (file != NULL) {
    if (fgets(tty_name, sizeof(tty_name), file) != NULL) {
      sanaka_trim(tty_name);
      if (tty_name[0] != '\0' && snprintf(buffer, buffer_size, "/dev/%s", tty_name) < (int) buffer_size && sanaka_file_exists(buffer)) {
        fclose(file);
        return 1;
      }
    }
    fclose(file);
  }

  tty_env = getenv("XDG_VTNR");
  if (tty_env != NULL && tty_env[0] != '\0') {
    if (snprintf(buffer, buffer_size, "/dev/tty%s", tty_env) < (int) buffer_size && sanaka_file_exists(buffer)) {
      return 1;
    }
  }

  resolved = ttyname(STDIN_FILENO);
  if (resolved != NULL && strncmp(resolved, "/dev/tty", 8) == 0 && sanaka_file_exists(resolved)) {
    sanaka_copy_string(buffer, buffer_size, resolved);
    return 1;
  }

  resolved = ttyname(STDOUT_FILENO);
  if (resolved != NULL && strncmp(resolved, "/dev/tty", 8) == 0 && sanaka_file_exists(resolved)) {
    sanaka_copy_string(buffer, buffer_size, resolved);
    return 1;
  }

  resolved = ttyname(STDERR_FILENO);
  if (resolved != NULL && strncmp(resolved, "/dev/tty", 8) == 0 && sanaka_file_exists(resolved)) {
    sanaka_copy_string(buffer, buffer_size, resolved);
    return 1;
  }

  return 0;
}

static void sanaka_detect_backend_summary(SanakaState *state) {
  char tty_path[256];
  if (state == NULL) {
    return;
  }

  sanaka_copy_string(state->read_backend_name, sizeof(state->read_backend_name), "none");
  sanaka_copy_string(state->write_backend_name, sizeof(state->write_backend_name), "none");
  state->active_tty_path[0] = '\0';

  if (sanaka_has_wayland_session() && sanaka_command_exists("wl-paste")) {
    sanaka_copy_string(state->read_backend_name, sizeof(state->read_backend_name), "wl-paste");
  } else if (sanaka_has_x11_session() && sanaka_command_exists("xclip")) {
    sanaka_copy_string(state->read_backend_name, sizeof(state->read_backend_name), "xclip");
  } else if (sanaka_has_x11_session() && sanaka_command_exists("xsel")) {
    sanaka_copy_string(state->read_backend_name, sizeof(state->read_backend_name), "xsel");
  }

  if (sanaka_has_wayland_session() && sanaka_command_exists("wl-copy")) {
    sanaka_copy_string(state->write_backend_name, sizeof(state->write_backend_name), "wl-copy");
  } else if (sanaka_has_x11_session() && sanaka_command_exists("xclip")) {
    sanaka_copy_string(state->write_backend_name, sizeof(state->write_backend_name), "xclip");
  } else if (sanaka_has_x11_session() && sanaka_command_exists("xsel")) {
    sanaka_copy_string(state->write_backend_name, sizeof(state->write_backend_name), "xsel");
  } else if (sanaka_detect_active_tty(tty_path, sizeof(tty_path))) {
    sanaka_copy_string(state->active_tty_path, sizeof(state->active_tty_path), tty_path);
    if (sanaka_file_exists("/dev/gpmctl")) {
      snprintf(state->write_backend_name, sizeof(state->write_backend_name), "tty-inject (%s, gpmctl present)", tty_path);
    } else {
      snprintf(state->write_backend_name, sizeof(state->write_backend_name), "tty-inject (%s)", tty_path);
    }
  }
}

static void sanaka_log_backend_summary(SanakaState *state) {
  if (state == NULL) {
    return;
  }
  sanaka_log_line("read backend: %s", state->read_backend_name);
  sanaka_log_line("write backend: %s", state->write_backend_name);
}

static void sanaka_hash_text(const char *text, char output[16]) {
  uint32_t hash = 2166136261u;
  const unsigned char *cursor = (const unsigned char *) (text != NULL ? text : "");
  while (*cursor != 0U) {
    hash ^= (uint32_t) (*cursor);
    hash *= 16777619u;
    cursor++;
  }
  snprintf(output, 16, "%08x", hash);
}

static int sanaka_escape_json_string(const char *input, char *output, size_t output_size) {
  size_t in_index = 0;
  size_t out_index = 0;
  if (input == NULL || output == NULL || output_size == 0) {
    return 0;
  }
  while (input[in_index] != '\0') {
    unsigned char ch = (unsigned char) input[in_index];
    const char *replacement = NULL;
    char unicode_escape[8];
    if (ch == '\\') replacement = "\\\\";
    else if (ch == '"') replacement = "\\\"";
    else if (ch == '\n') replacement = "\\n";
    else if (ch == '\r') replacement = "\\r";
    else if (ch == '\t') replacement = "\\t";
    else if (ch < 0x20) {
      snprintf(unicode_escape, sizeof(unicode_escape), "\\u%04x", ch);
      replacement = unicode_escape;
    }
    if (replacement != NULL) {
      size_t len = strlen(replacement);
      if (out_index + len + 1 >= output_size) return 0;
      memcpy(output + out_index, replacement, len);
      out_index += len;
    } else {
      if (out_index + 2 >= output_size) return 0;
      output[out_index++] = (char) ch;
    }
    in_index++;
  }
  output[out_index] = '\0';
  return 1;
}

static int sanaka_extract_json_string(const char *json, const char *key, char *out, size_t out_size) {
  char pattern[64];
  const char *start;
  const char *cursor;
  size_t out_index = 0;
  if (json == NULL || key == NULL || out == NULL || out_size == 0) {
    return 0;
  }
  snprintf(pattern, sizeof(pattern), "\"%s\":\"", key);
  start = strstr(json, pattern);
  if (start == NULL) return 0;
  cursor = start + strlen(pattern);
  while (*cursor != '\0' && *cursor != '"') {
    if (*cursor == '\\') {
      cursor++;
      if (*cursor == 'n') out[out_index++] = '\n';
      else if (*cursor == 'r') out[out_index++] = '\r';
      else if (*cursor == 't') out[out_index++] = '\t';
      else if (*cursor == '"' || *cursor == '\\' || *cursor == '/') out[out_index++] = *cursor;
      else return 0;
      cursor++;
      if (out_index + 1 >= out_size) return 0;
      continue;
    }
    if (out_index + 1 >= out_size) return 0;
    out[out_index++] = *cursor++;
  }
  if (*cursor != '"') return 0;
  out[out_index] = '\0';
  return 1;
}

static int sanaka_extract_json_int(const char *json, const char *key, int *value) {
  char pattern[64];
  const char *start;
  if (json == NULL || key == NULL || value == NULL) return 0;
  snprintf(pattern, sizeof(pattern), "\"%s\":", key);
  start = strstr(json, pattern);
  if (start == NULL) return 0;
  *value = atoi(start + (int) strlen(pattern));
  return 1;
}

static int sanaka_read_line(int socket_fd, char *buffer, int buffer_size) {
  int total = 0;
  while (total < buffer_size - 1) {
    char ch;
    ssize_t received = recv(socket_fd, &ch, 1, 0);
    if (received <= 0) return 0;
    if (ch == '\n') break;
    buffer[total++] = ch;
  }
  buffer[total] = '\0';
  return total > 0;
}

static int sanaka_send_all(int socket_fd, const char *buffer, int length) {
  int sent_total = 0;
  while (sent_total < length) {
    ssize_t sent = send(socket_fd, buffer + sent_total, (size_t) (length - sent_total), 0);
    if (sent <= 0) return 0;
    sent_total += (int) sent;
  }
  return 1;
}

static int sanaka_connect_socket(const char *host, int port) {
  struct addrinfo hints;
  struct addrinfo *result = NULL;
  struct addrinfo *current;
  char port_text[16];
  int socket_fd = -1;

  memset(&hints, 0, sizeof(hints));
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;

  snprintf(port_text, sizeof(port_text), "%d", port);
  if (getaddrinfo(host, port_text, &hints, &result) != 0) {
    return -1;
  }

  for (current = result; current != NULL; current = current->ai_next) {
    socket_fd = (int) socket(current->ai_family, current->ai_socktype, current->ai_protocol);
    if (socket_fd < 0) continue;
    if (connect(socket_fd, current->ai_addr, current->ai_addrlen) == 0) {
      freeaddrinfo(result);
      return socket_fd;
    }
    close(socket_fd);
    socket_fd = -1;
  }

  freeaddrinfo(result);
  return -1;
}

static int sanaka_load_config(SanakaConfig *config) {
  char path[1024];
  FILE *file;
  char line[512];
  if (config == NULL) return 0;

  sanaka_copy_string(config->host, sizeof(config->host), "10.0.2.2");
  config->bootstrap_port = SANAKA_BOOTSTRAP_PORT;
  config->port = 0;
  config->session_id[0] = '\0';
  config->machine_mac[0] = '\0';
  config->protocol_version = SANAKA_PROTOCOL_VERSION;

  if (snprintf(path, sizeof(path), "%s/config/sanaka-clipboard.ini", g_state.runtime_dir) >= (int) sizeof(path)) {
    sanaka_log_line("config path too long");
    return 0;
  }
  file = fopen(path, "r");
  if (file == NULL) {
    if (snprintf(path, sizeof(path), "%s/../config/sanaka-clipboard.ini", g_state.runtime_dir) >= (int) sizeof(path)) {
      sanaka_log_line("fallback config path too long");
      return 0;
    }
    file = fopen(path, "r");
  }
  if (file == NULL) {
    sanaka_log_line("config not found, using defaults");
    return 1;
  }

  while (fgets(line, sizeof(line), file) != NULL) {
    char *equal = strchr(line, '=');
    if (equal == NULL) continue;
    *equal = '\0';
    sanaka_trim(line);
    sanaka_trim(equal + 1);
    if (strcmp(line, "host") == 0) {
      sanaka_copy_string(config->host, sizeof(config->host), equal + 1);
    } else if (strcmp(line, "bootstrap_port") == 0) {
      config->bootstrap_port = atoi(equal + 1);
    } else if (strcmp(line, "port") == 0) {
      config->port = atoi(equal + 1);
    } else if (strcmp(line, "session_id") == 0) {
      sanaka_copy_string(config->session_id, sizeof(config->session_id), equal + 1);
    } else if (strcmp(line, "machine_mac") == 0) {
      sanaka_copy_string(config->machine_mac, sizeof(config->machine_mac), equal + 1);
    } else if (strcmp(line, "protocol_version") == 0) {
      config->protocol_version = atoi(equal + 1);
    }
  }

  fclose(file);
  return 1;
}

static int sanaka_detect_machine_mac(char *buffer, size_t buffer_size) {
  FILE *pipe;
  char line[256];
  const char *commands[] = {
    "ip link | sed -n 's/.*link\\/ether \\([0-9a-f:][0-9a-f:]*\\).*/\\1/p' | head -n 1",
    "ifconfig 2>/dev/null | sed -n 's/.*ether \\([0-9a-f:][0-9a-f:]*\\).*/\\1/p' | head -n 1",
    NULL
  };
  int index = 0;

  while (commands[index] != NULL) {
    pipe = popen(commands[index], "r");
    if (pipe != NULL) {
      if (fgets(line, sizeof(line), pipe) != NULL) {
        sanaka_trim(line);
        if (strlen(line) >= 17U) {
          sanaka_copy_string(buffer, buffer_size, line);
          pclose(pipe);
          return 1;
        }
      }
      pclose(pipe);
    }
    index++;
  }
  return 0;
}

static int sanaka_run_command_capture(const char *command, char *buffer, size_t buffer_size) {
  FILE *pipe;
  size_t total = 0;
  int ch;
  if (command == NULL || buffer == NULL || buffer_size == 0) return 0;
  pipe = popen(command, "r");
  if (pipe == NULL) return 0;
  while ((ch = fgetc(pipe)) != EOF && total + 1 < buffer_size) {
    buffer[total++] = (char) ch;
  }
  buffer[total] = '\0';
  pclose(pipe);
  return total > 0;
}

static int sanaka_read_clipboard_text(char *buffer, size_t buffer_size) {
  char temp[SANAKA_MAX_TEXT_BYTES];
  if (sanaka_has_wayland_session() && sanaka_command_exists("wl-paste")) {
    if (sanaka_run_command_capture("wl-paste --no-newline 2>/dev/null", temp, sizeof(temp))) {
      sanaka_normalize_newlines_to_lf(temp);
      sanaka_copy_string(buffer, buffer_size, temp);
      return 1;
    }
  }
  if (sanaka_has_x11_session() && sanaka_command_exists("xclip")) {
    if (sanaka_run_command_capture("xclip -selection clipboard -out 2>/dev/null", temp, sizeof(temp))) {
      sanaka_normalize_newlines_to_lf(temp);
      sanaka_copy_string(buffer, buffer_size, temp);
      return 1;
    }
  }
  if (sanaka_has_x11_session() && sanaka_command_exists("xsel")) {
    if (sanaka_run_command_capture("xsel --clipboard --output 2>/dev/null", temp, sizeof(temp))) {
      sanaka_normalize_newlines_to_lf(temp);
      sanaka_copy_string(buffer, buffer_size, temp);
      return 1;
    }
  }
  return 0;
}

static int sanaka_write_tty_text(const char *text, char *used_tty_path, size_t used_tty_path_size) {
  char tty_path[256];
  int tty_fd;
  const unsigned char *cursor;
  if (text == NULL || text[0] == '\0') {
    return 0;
  }
  if (!sanaka_detect_active_tty(tty_path, sizeof(tty_path))) {
    return 0;
  }
  tty_fd = open(tty_path, O_RDWR | O_NOCTTY);
  if (tty_fd < 0) {
    return 0;
  }
  cursor = (const unsigned char *) text;
  while (*cursor != 0U) {
    char ch = (char) *cursor;
    if (ch == '\n') {
      ch = '\r';
    }
    if (ioctl(tty_fd, TIOCSTI, &ch) != 0) {
      close(tty_fd);
      return 0;
    }
    cursor++;
  }
  close(tty_fd);
  if (used_tty_path != NULL && used_tty_path_size > 0) {
    sanaka_copy_string(used_tty_path, used_tty_path_size, tty_path);
  }
  return 1;
}

static int sanaka_write_clipboard_text(const char *text, char *backend_used, size_t backend_used_size) {
  FILE *pipe;
  char tty_path[256];
  char *normalized_text;
  size_t normalized_size;
  size_t length;

  if (backend_used != NULL && backend_used_size > 0) {
    backend_used[0] = '\0';
  }

  if (text == NULL) {
    return 0;
  }

  normalized_size = strlen(text) + 1;
  normalized_text = (char *) malloc(normalized_size);
  if (normalized_text == NULL) {
    return 0;
  }
  sanaka_copy_string(normalized_text, normalized_size, text);
  sanaka_normalize_newlines_to_lf(normalized_text);
  length = strlen(normalized_text);

  if (sanaka_has_wayland_session() && sanaka_command_exists("wl-copy")) {
    pipe = popen("wl-copy 2>/dev/null", "w");
    if (pipe != NULL) {
      size_t written = fwrite(normalized_text, 1, length, pipe);
      int exit_code = pclose(pipe);
      if (written == length && exit_code == 0) {
        sanaka_copy_string(backend_used, backend_used_size, "wl-copy");
        free(normalized_text);
        return 1;
      }
    }
  }

  if (sanaka_has_x11_session() && sanaka_command_exists("xclip")) {
    pipe = popen("xclip -selection clipboard -in 2>/dev/null", "w");
    if (pipe != NULL) {
      size_t written = fwrite(normalized_text, 1, length, pipe);
      int exit_code = pclose(pipe);
      if (written == length && exit_code == 0) {
        sanaka_copy_string(backend_used, backend_used_size, "xclip");
        free(normalized_text);
        return 1;
      }
    }
  }

  if (sanaka_has_x11_session() && sanaka_command_exists("xsel")) {
    pipe = popen("xsel --clipboard --input 2>/dev/null", "w");
    if (pipe != NULL) {
      size_t written = fwrite(normalized_text, 1, length, pipe);
      int exit_code = pclose(pipe);
      if (written == length && exit_code == 0) {
        sanaka_copy_string(backend_used, backend_used_size, "xsel");
        free(normalized_text);
        return 1;
      }
    }
  }

  if (sanaka_write_tty_text(normalized_text, tty_path, sizeof(tty_path))) {
    if (sanaka_file_exists("/dev/gpmctl")) {
      snprintf(backend_used, backend_used_size, "tty-inject (%s, gpmctl present)", tty_path);
    } else {
      snprintf(backend_used, backend_used_size, "tty-inject (%s)", tty_path);
    }
    free(normalized_text);
    return 1;
  }

  free(normalized_text);
  return 0;
}

static int sanaka_bootstrap(SanakaState *state) {
  int bootstrap_socket;
  char escaped_mac[64];
  char payload[256];
  char response[SANAKA_JSON_BUFFER];
  int response_port = 0;

  if (state == NULL) return 0;

  if (!sanaka_detect_machine_mac(state->current_mac, sizeof(state->current_mac))) {
    sanaka_log_line("bootstrap aborted: failed to detect machine mac");
    return 0;
  }
  if (!sanaka_escape_json_string(state->current_mac, escaped_mac, sizeof(escaped_mac))) {
    sanaka_log_line("bootstrap aborted: failed to escape machine mac");
    return 0;
  }

  bootstrap_socket = sanaka_connect_socket(state->config.host, state->config.bootstrap_port);
  if (bootstrap_socket < 0) {
    sanaka_log_line("bootstrap socket connect failed");
    return 0;
  }

  snprintf(payload, sizeof(payload), "{\"type\":\"bootstrap_request\",\"protocolVersion\":%d,\"machineMac\":\"%s\"}\n", state->config.protocol_version, escaped_mac);
  if (!sanaka_send_all(bootstrap_socket, payload, (int) strlen(payload))) {
    sanaka_log_line("bootstrap send failed");
    close(bootstrap_socket);
    return 0;
  }

  if (!sanaka_read_line(bootstrap_socket, response, sizeof(response))) {
    sanaka_log_line("bootstrap read failed");
    close(bootstrap_socket);
    return 0;
  }
  close(bootstrap_socket);
  sanaka_log_line("bootstrap response received");

  if (strstr(response, "\"type\":\"bootstrap_ack\"") == NULL) {
    sanaka_log_line("bootstrap did not return ack");
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
  sanaka_log_line("bootstrap ready");
  return 1;
}

static int sanaka_send_hello(int socket_fd, const SanakaConfig *config) {
  char payload[512];
  snprintf(payload, sizeof(payload), "{\"type\":\"hello\",\"protocolVersion\":%d,\"sessionId\":\"%s\",\"clientName\":\"sanaka-clipboard\",\"clientOs\":\"linux\"}\n", config->protocol_version, config->session_id);
  return sanaka_send_all(socket_fd, payload, (int) strlen(payload));
}

static int sanaka_connect_bridge(SanakaState *state) {
  int socket_fd;
  if (state == NULL || state->config.port <= 0 || state->config.session_id[0] == '\0') {
    return 0;
  }
  socket_fd = sanaka_connect_socket(state->config.host, state->config.port);
  if (socket_fd < 0) {
    sanaka_log_line("bridge socket connect failed");
    return 0;
  }
  if (!sanaka_send_hello(socket_fd, &state->config)) {
    sanaka_log_line("bridge hello send failed");
    close(socket_fd);
    return 0;
  }
  fcntl(socket_fd, F_SETFL, fcntl(socket_fd, F_GETFL, 0) | O_NONBLOCK);
  state->socket_fd = socket_fd;
  state->connected = 1;
  state->last_heartbeat_ms = sanaka_now_ms();
  sanaka_log_line("bridge connected and hello sent");
  return 1;
}

static void sanaka_disconnect(SanakaState *state) {
  if (state == NULL) return;
  if (state->connected && state->socket_fd >= 0) {
    close(state->socket_fd);
  }
  state->socket_fd = -1;
  state->connected = 0;
  state->bootstrap_ready = 0;
  state->config.port = 0;
  state->config.session_id[0] = '\0';
  sanaka_log_line("bridge disconnected");
}

static void sanaka_send_clipboard_if_changed(SanakaState *state) {
  char *text_buffer;
  char *escaped_text;
  char hash[16];
  if (state == NULL || !state->connected) return;

  text_buffer = (char *) malloc(SANAKA_MAX_TEXT_BYTES);
  escaped_text = (char *) malloc(SANAKA_MAX_TEXT_BYTES);
  if (text_buffer == NULL || escaped_text == NULL) {
    free(text_buffer);
    free(escaped_text);
    sanaka_log_line("clipboard send skipped: memory allocation failed");
    return;
  }

  if (!sanaka_read_clipboard_text(text_buffer, SANAKA_MAX_TEXT_BYTES)) {
    free(text_buffer);
    free(escaped_text);
    return;
  }

  sanaka_hash_text(text_buffer, hash);
  if (strcmp(hash, state->last_local_hash) == 0) {
    free(text_buffer);
    free(escaped_text);
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

  {
    const char *prefix = "{\"type\":\"clipboard_push\",\"source\":\"guest\",\"hash\":\"";
    const char *middle = "\",\"text\":\"";
    const char *suffix = "\"}\n";
    sanaka_send_all(state->socket_fd, prefix, (int) strlen(prefix));
    sanaka_send_all(state->socket_fd, hash, (int) strlen(hash));
    sanaka_send_all(state->socket_fd, middle, (int) strlen(middle));
    sanaka_send_all(state->socket_fd, escaped_text, (int) strlen(escaped_text));
    sanaka_send_all(state->socket_fd, suffix, (int) strlen(suffix));
  }

  free(text_buffer);
  free(escaped_text);
}

static void sanaka_send_heartbeat_if_needed(SanakaState *state, long now_ms) {
  const char *heartbeat = "{\"type\":\"heartbeat\"}\n";
  if (state == NULL || !state->connected) return;
  if (now_ms - state->last_heartbeat_ms < SANAKA_HEARTBEAT_INTERVAL_MS) return;
  sanaka_send_all(state->socket_fd, heartbeat, (int) strlen(heartbeat));
  state->last_heartbeat_ms = now_ms;
}

static int sanaka_recv_once(SanakaState *state) {
  char buffer[SANAKA_JSON_BUFFER];
  ssize_t received;
  if (state == NULL || !state->connected) return 0;
  received = recv(state->socket_fd, buffer, sizeof(buffer) - 1, 0);
  if (received < 0) {
    if (errno == EAGAIN || errno == EWOULDBLOCK) return 1;
    sanaka_log_line("bridge recv failed");
    sanaka_disconnect(state);
    return 0;
  }
  if (received == 0) {
    sanaka_log_line("bridge closed by host");
    sanaka_disconnect(state);
    return 0;
  }
  buffer[received] = '\0';
  if (strstr(buffer, "\"type\":\"clipboard_push\"") != NULL) {
    char *text_buffer = (char *) malloc(SANAKA_MAX_TEXT_BYTES);
    char backend_used[256];
    char hash[16];
    if (text_buffer == NULL) return 1;
    backend_used[0] = '\0';
    if (sanaka_extract_json_string(buffer, "text", text_buffer, SANAKA_MAX_TEXT_BYTES)
      && sanaka_extract_json_string(buffer, "hash", hash, sizeof(hash))) {
      if (sanaka_write_clipboard_text(text_buffer, backend_used, sizeof(backend_used))) {
        sanaka_copy_string(state->last_remote_applied_hash, sizeof(state->last_remote_applied_hash), hash);
        sanaka_copy_string(state->last_local_hash, sizeof(state->last_local_hash), hash);
        sanaka_log_line("clipboard_push applied via %s", backend_used[0] != '\0' ? backend_used : "unknown-backend");
      } else {
        sanaka_log_line("clipboard write skipped: no desktop backend and no active tty backend");
      }
    }
    free(text_buffer);
  }
  return 1;
}

static void sanaka_handle_signal(int signum) {
  (void) signum;
  g_should_exit = 1;
}

int main(void) {
  long now_ms;
  memset(&g_state, 0, sizeof(g_state));
  g_state.socket_fd = -1;
  sanaka_prepare_paths(&g_state);
  sanaka_load_config(&g_state.config);
  sanaka_detect_backend_summary(&g_state);
  signal(SIGINT, sanaka_handle_signal);
  signal(SIGTERM, sanaka_handle_signal);
  sanaka_log_line("sanaka-clipboard start");
  sanaka_log_backend_summary(&g_state);

  while (!g_should_exit) {
    now_ms = sanaka_now_ms();
    if (!g_state.bootstrap_ready && now_ms - g_state.last_reconnect_ms >= SANAKA_RECONNECT_INTERVAL_MS) {
      g_state.last_reconnect_ms = now_ms;
      sanaka_bootstrap(&g_state);
    }
    if (g_state.bootstrap_ready && !g_state.connected && now_ms - g_state.last_reconnect_ms >= SANAKA_RECONNECT_INTERVAL_MS) {
      g_state.last_reconnect_ms = now_ms;
      sanaka_connect_bridge(&g_state);
    }
    if (g_state.connected) {
      sanaka_recv_once(&g_state);
      if (now_ms - g_state.last_poll_ms >= SANAKA_POLL_INTERVAL_MS) {
        g_state.last_poll_ms = now_ms;
        sanaka_send_clipboard_if_changed(&g_state);
      }
      sanaka_send_heartbeat_if_needed(&g_state, now_ms);
    }
    sanaka_sleep_ms(100);
  }

  sanaka_disconnect(&g_state);
  sanaka_log_line("sanaka-clipboard stop");
  return 0;
}
