#!/bin/sh

sanaka_i18n_var_name() {
  key=$1
  key=$(printf '%s' "$key" | tr '.-' '__')
  printf 'SANAKA_I18N_%s' "$key"
}

sanaka_i18n_put() {
  key=$1
  value=$2
  var_name=$(sanaka_i18n_var_name "$key")
  eval "${var_name}=\$(printf '%s' \"\$value\")"
}

sanaka_detect_lang() {
  if [ -n "${SANAKA_LANG:-}" ]; then
    printf '%s\n' "$SANAKA_LANG"
    return 0
  fi

  raw_lang="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
  raw_lower=$(printf '%s' "$raw_lang" | tr '[:upper:]' '[:lower:]')

  case "$raw_lower" in
    zh*utf-8*|zh*utf8*)
      printf '%s\n' "zh-CN"
      ;;
    zh*)
      printf '%s\n' "en-US"
      ;;
    en*|"")
      printf '%s\n' "en-US"
      ;;
    *)
      printf '%s\n' "en-US"
      ;;
  esac
}

sanaka_load_i18n() {
  locale_dir=$1
  selected_lang=$(sanaka_detect_lang)

  . "$locale_dir/en-US.sh"
  if [ "$selected_lang" != "en-US" ] && [ -f "$locale_dir/$selected_lang.sh" ]; then
    . "$locale_dir/$selected_lang.sh"
  fi

  SANAKA_ACTIVE_LANG=$selected_lang
  export SANAKA_ACTIVE_LANG
}

sanaka_t() {
  key=$1
  var_name=$(sanaka_i18n_var_name "$key")
  eval "value=\${$var_name-}"
  if [ -n "${value:-}" ]; then
    printf '%s' "$value"
  else
    printf '%s' "$key"
  fi
}

sanaka_printf() {
  key=$1
  shift
  printf "$(sanaka_t "$key")" "$@"
}

sanaka_printf_ln() {
  key=$1
  shift
  printf "$(sanaka_t "$key")\n" "$@"
}

sanaka_warn_ln() {
  key=$1
  shift
  printf "$(sanaka_t "$key")\n" "$@" >&2
}

sanaka_is_interactive() {
  [ -t 0 ] && [ -t 1 ]
}

sanaka_confirm_yes() {
  key=$1
  prompt=$(sanaka_t "$key")
  while true; do
    printf '%s [Y/n] ' "$prompt"
    if ! IFS= read -r answer; then
      return 1
    fi
    case $(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]') in
      ""|y|yes)
        return 0
        ;;
      n|no)
        return 1
        ;;
    esac
  done
}
