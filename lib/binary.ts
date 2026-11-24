/** Converts UTF-8 text to a readable byte-oriented binary string. This is encoding, not encryption. */
export function textToBinary(value: string): string {
  return Array.from(new TextEncoder().encode(value), (byte) => byte.toString(2).padStart(8, "0")).join(" ");
}

/** Converts byte-oriented binary back to UTF-8 text. Invalid input returns an empty string. */
export function binaryToText(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  const groups = normalized.split(/\s+/);
  if (groups.some((group) => !/^[01]{8}$/.test(group))) return "";
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(groups.map((group) => Number.parseInt(group, 2))));
  } catch {
    return "";
  }
}
