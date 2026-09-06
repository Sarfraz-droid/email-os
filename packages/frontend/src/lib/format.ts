/** Human-readable byte size, e.g. 191116 → "187 KB". */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v < 10 && u > 0 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

/** "Abhigyan Raj <a@b.com>" → "Abhigyan Raj"; falls back to the raw string. */
export function displayName(addr: string): string {
  if (!addr) return "";
  const m = addr.match(/^\s*"?([^"<]+?)"?\s*<.*>$/);
  return (m ? m[1] : addr.replace(/<.*>/, "")).trim() || addr;
}

/** First alphanumeric of a sender's display name, uppercased. */
export function initialOf(from: string): string {
  const name = displayName(from);
  return (name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();
}

/**
 * Deterministic accent for a sender — a stable hue derived from the address so
 * every chip from the same person shares one colour.
 */
export function senderAccent(from: string): { dot: string; bg: string; fg: string } {
  const key = (from.match(/<([^>]+)>/)?.[1] ?? from).toLowerCase().trim();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    dot: `oklch(0.72 0.15 ${hue})`,
    bg: `oklch(0.72 0.15 ${hue} / 0.16)`,
    fg: `oklch(0.86 0.11 ${hue})`,
  };
}

/** Decodes HTML entities Gmail leaves in snippet/subject text (`Don&#39;t`). */
export function decodeEntities(input: string): string {
  if (!input) return "";
  const el = document.createElement("textarea");
  el.innerHTML = input;
  return el.value;
}
