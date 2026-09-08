/** Format domestic numbers without discarding invalid input or altering international numbers. */
export function formatContactPhone(value: string) {
  if (!/^\d[\d ()-]*$/.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  if (!digits.startsWith("0") || digits.length > 11) return value;
  const prefixLength = digits.startsWith("02") ? 2 : 3;
  const middleLength = digits.startsWith("010") || digits.length === prefixLength + 8 ? 4 : 3;
  if (digits.length <= prefixLength) return digits;
  if (digits.length <= prefixLength + middleLength) return digits.slice(0, prefixLength) + "-" + digits.slice(prefixLength);
  return digits.slice(0, prefixLength) + "-" + digits.slice(prefixLength, prefixLength + middleLength) + "-" + digits.slice(prefixLength + middleLength);
}

/** Locate the same digit after inserting/removing separators, so editing does not jump to the end. */
export function contactPhoneCaret(raw: string, caret: number, formatted: string) {
  if (raw === formatted) return caret;
  const digitCount = raw.slice(0, caret).replace(/\D/g, "").length;
  if (digitCount === 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index]) && ++seen === digitCount) return index + 1;
  }
  return formatted.length;
}
