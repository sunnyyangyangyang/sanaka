export function getMessage(
  messages: Record<string, unknown>,
  key: string,
  vars?: Record<string, string | number>
): string {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, messages);

  let text = typeof value === 'string' ? value : key;

  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
    });
  }

  return text;
}
