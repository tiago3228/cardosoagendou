export const SHARE_STYLES = [
  { value: "professional", label: "Profissional" },
  { value: "warm", label: "Acolhedor" },
  { value: "creative", label: "Criativo" },
  { value: "direct", label: "Direto" },
] as const;

export type ShareStyle = (typeof SHARE_STYLES)[number]["value"];

const NICHE_LABELS: Record<string, string> = {
  BARBERSHOP: "barbearia",
  HAIR_SALON: "salão de beleza",
  BEAUTY_SALON: "espaço de beleza",
  AESTHETIC_CLINIC: "clínica de estética",
  NAIL_SALON: "espaço de unhas",
  MASSAGE: "espaço de bem-estar",
  TATTOO: "estúdio de tatuagem",
  THERAPY: "consultório",
  OTHER: "negócio",
};

const STYLE_TEMPLATES: Record<ShareStyle, string> = {
  professional:
    "Agende seu horário com praticidade na {business}. Escolha o melhor dia e horário pelo link:",
  warm: "Vai ser um prazer receber você na {business}! Reserve seu horário com carinho pelo link:",
  creative:
    "Seu próximo momento especial começa aqui. Venha para a {business} e escolha seu horário:",
  direct: "Agende seu horário na {business} pelo link:",
};

export const DEFAULT_PUBLIC_BOOKING_ORIGIN = "https://agendou-br.lovable.app";

function isTechnicalOrigin(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return (
      hostname === "localhost" ||
      hostname.endsWith(".lovableproject.com") ||
      hostname.endsWith(".lovableproject-dev.com") ||
      hostname.endsWith(".gpt-eng.com")
    );
  } catch {
    return true;
  }
}

export function resolvePublicBookingOrigin(
  configuredOrigin: string | null | undefined,
  currentOrigin?: string,
) {
  for (const candidate of [configuredOrigin, currentOrigin, DEFAULT_PUBLIC_BOOKING_ORIGIN]) {
    const normalized = candidate?.trim().replace(/\/$/, "");
    if (normalized && !isTechnicalOrigin(normalized)) return normalized;
  }
  return DEFAULT_PUBLIC_BOOKING_ORIGIN;
}

export function nicheLabel(niche: string) {
  return NICHE_LABELS[niche] ?? "negócio";
}

export function generateBookingShareMessage(
  businessName: string,
  niche: string,
  style: ShareStyle,
) {
  const template = STYLE_TEMPLATES[style] ?? STYLE_TEMPLATES.professional;
  return template.replace("{business}", businessName.trim() || nicheLabel(niche));
}

export function buildBookingShareText(message: string, bookingUrl: string) {
  const cleanMessage = message.trim();
  return cleanMessage ? `${cleanMessage}\n\nAgende aqui: ${bookingUrl}` : bookingUrl;
}
