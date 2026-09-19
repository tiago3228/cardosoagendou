const TECHNICAL_CODE_MESSAGES: Record<string, string> = {
  PLAN_SEGMENT_LIMIT_REACHED:
    "Seu plano permite até 2 segmentos ativos. Para adicionar outro segmento, desative um dos segmentos atuais ou faça upgrade do seu plano.",
  PLAN_LIMIT_REACHED: "O limite do seu plano foi atingido. Faça upgrade para continuar.",
  FEATURE_LOCKED_TEAM: "Esse recurso não está disponível no seu plano atual.",
  FEATURE_LOCKED: "Esse recurso não está disponível no seu plano atual.",
  SLOT_UNAVAILABLE: "Esse horário não está mais disponível. Escolha outro horário.",
  DOUBLE_BOOKING: "Esse horário já foi reservado. Escolha outro horário.",
  SERVICE_NOT_AVAILABLE: "Um dos serviços selecionados não está mais disponível.",
  SERVICE_CONFLICT: "Os serviços selecionados não podem ser combinados no mesmo atendimento.",
  DUPLICATE_SERVICE: "Este serviço já foi adicionado ao atendimento.",
  SERVICE_COMPOSITION_CONFLICT: "Este serviço já faz parte de um conjunto selecionado.",
  SERVICE_COMPOSITION_INVALID:
    "Serviço composto inválido. Um conjunto não pode ser incluído dentro de outro conjunto.",
  SERVICE_NOT_FOUND: "O serviço selecionado não foi encontrado.",
  PROFESSIONAL_NOT_AVAILABLE: "O profissional selecionado não está disponível.",
  PROFESSIONAL_SERVICE_MISMATCH: "O profissional não atende um dos serviços selecionados.",
  SEGMENT_NOT_FOUND: "O segmento selecionado não foi encontrado.",
  SEGMENT_NOT_ACTIVE_FOR_BUSINESS: "O segmento selecionado não está disponível para este negócio.",
  INSUFFICIENT_STOCK: "Não há estoque suficiente para concluir esta operação.",
  POLICY_NOT_ACCEPTED: "Aceite a política do estabelecimento para continuar.",
  INVALID_BOOKING: "Confira os dados do agendamento e tente novamente.",
  BOOKING_MIGRATION_REQUIRED:
    "O banco do estabelecimento ainda não está preparado para receber agendamentos. O proprietário precisa executar a migration de agendamentos no editor SQL do Lovable.",
  PRODUCT_SELECTION_NOT_AVAILABLE: "A seleção de produtos não está disponível no plano atual.",
  PRODUCT_NOT_AVAILABLE: "Um dos produtos selecionados não está disponível ou ficou sem estoque.",
  WHATSAPP_INVALID: "Informe um número de WhatsApp válido.",
  BUSINESS_NOT_FOUND: "Este link público não está disponível no momento.",
  PROFESSIONAL_NOT_AVAILABLE: "O profissional escolhido não está mais disponível.",
  PROFESSIONAL_SERVICE_MISMATCH:
    "O profissional escolhido não atende um dos serviços selecionados.",
  APPOINTMENT_FAILED:
    "O banco não conseguiu registrar o agendamento. Verifique se as migrations de agendamento foram executadas no Lovable.",
  FORBIDDEN: "Você não tem permissão para realizar esta ação.",
  UNAUTHORIZED: "Sua sessão expirou. Entre novamente para continuar.",
  USER_ALREADY_EXISTS: "Este e-mail já está cadastrado.",
  INVITE_INVALID: "Este convite é inválido ou já expirou.",
};

const ENGLISH_MESSAGE_PATTERNS: Array<[RegExp, string]> = [
  [/already registered|already exists|user already/i, "Este e-mail já está cadastrado."],
  [/invalid.*(email|e-mail)|email.*invalid/i, "Informe um e-mail válido."],
  [/duplicate key|unique constraint/i, "Este registro já existe."],
  [/not found|does not exist|could not find/i, "O registro solicitado não foi encontrado."],
  [
    /permission denied|not authorized|unauthorized/i,
    "Você não tem permissão para realizar esta ação.",
  ],
  [
    /network|fetch failed|failed to fetch|timeout/i,
    "Não foi possível conectar ao servidor. Tente novamente.",
  ],
];

function extractErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function userFacingError(
  error: unknown,
  fallback = "Não foi possível concluir a operação.",
): string {
  const raw = extractErrorText(error).trim();
  if (!raw) return fallback;

  const code = raw.match(/^([A-Z][A-Z0-9_]+)(?::|$)/)?.[1];
  if (code === "APPOINTMENT_FAILED") {
    const detail = raw.replace(/^APPOINTMENT_FAILED:\s*/i, "").trim();
    return detail ? `O banco rejeitou o agendamento: ${detail}` : fallback;
  }
  if (code && TECHNICAL_CODE_MESSAGES[code]) return TECHNICAL_CODE_MESSAGES[code];

  for (const [pattern, message] of ENGLISH_MESSAGE_PATTERNS) {
    if (pattern.test(raw)) return message;
  }

  if (/^[A-Z][A-Z0-9_]+(?::|$)/.test(raw) || /PGRST|postgres|supabase|sql|constraint/i.test(raw)) {
    return fallback;
  }

  if (
    /[ãõçáéíóúâêô]/i.test(raw) ||
    /\b(não|informe|selecione|erro|inválid|sucesso|plano|horário|serviço|usuário|conta|pagamento)\b/i.test(
      raw,
    )
  ) {
    return raw;
  }

  return fallback;
}

export function isTechnicalError(error: unknown, code: string): boolean {
  return extractErrorText(error).includes(code);
}

export { TECHNICAL_CODE_MESSAGES };
