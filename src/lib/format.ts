/** Formatting + normalization helpers shared by client and server. Pure functions only. */

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Normalizes a Brazilian WhatsApp number typed in a friendly format
 * (e.g. "55 (31) 975414498", "(31) 97541-4498", "31975414498")
 * into E.164: "+5531975414498". Returns null when it cannot be a valid number.
 */
export function normalizeBrWhatsapp(input: string): string | null {
  const digits = (input ?? "").replace(/\D+/g, "");
  if (digits.length === 0) return null;

  let national = digits;
  if (national.startsWith("0")) national = national.replace(/^0+/, "");
  if (national.startsWith("55") && national.length >= 12) national = national.slice(2);

  // national must be DDD (2) + subscriber (8 or 9)
  if (national.length !== 10 && national.length !== 11) return null;
  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (national.length === 11 && national[2] !== "9") return null;

  return `+55${national}`;
}

/**
 * Extracts the national digits (DDD + number, max 11) from any input,
 * dropping an optional 55 country code / leading zeros.
 */
export function brPhoneDigits(input: string | null | undefined): string {
  let digits = (input ?? "").replace(/\D+/g, "").replace(/^0+/, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.slice(0, 11);
}

/** Masks national digits as "(31) 99999-9999" (or "(31) 9999-9999" for 8-digit numbers). */
export function maskBrPhone(input: string | null | undefined): string {
  const d = brPhoneDigits(input);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  const split = rest.length > 8 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** Renders an E.164 BR number as "(31) 99999-9999". */
export function formatWhatsapp(e164: string | null | undefined): string {
  if (!e164) return "";
  const masked = maskBrPhone(e164);
  return masked || e164;
}

export function whatsappLink(e164: string | null | undefined, message?: string): string {
  const digits = (e164 ?? "").replace(/\D+/g, "");
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function normalizeInstagramUrl(input: string | null | undefined): string | null {
  const value = (input ?? "").trim();
  if (!value) return null;
  const candidate = value.replace(/^@+/, "");
  const rawUrl = /^https?:\/\//i.test(candidate)
    ? candidate
    : `https://www.instagram.com/${candidate}`;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    !["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())
  ) {
    return null;
  }
  const username = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (
    !/^[a-zA-Z0-9._]{1,30}$/.test(username) ||
    url.pathname.split("/").filter(Boolean).length !== 1
  ) {
    return null;
  }
  return `https://www.instagram.com/${username}`;
}

export function instagramHandle(url: string | null | undefined): string | null {
  const normalized = normalizeInstagramUrl(url);
  if (!normalized) return null;
  return `@${normalized.split("/").filter(Boolean).pop()}`;
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
