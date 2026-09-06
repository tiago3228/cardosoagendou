/**
 * Business types drive terminology and default service catalogs only.
 * They MUST never fork application logic — the appointment engine,
 * subscriptions, tenancy and permissions are shared by every type.
 */

export const BUSINESS_TYPES = [
  "BARBERSHOP",
  "HAIR_SALON",
  "BEAUTY_SALON",
  "AESTHETIC_CLINIC",
  "NAIL_SALON",
  "MASSAGE",
  "TATTOO",
  "THERAPY",
  "OTHER",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export interface BusinessTypeConfig {
  label: string;
  /** Singular/plural noun used for the people who perform services. */
  professional: string;
  professionals: string;
  /** Noun used for the bookable unit. */
  service: string;
  services: string;
  categories: string[];
  sampleServices: {
    name: string;
    duration_minutes: number;
    price_cents: number;
    category: string;
  }[];
}

const DEFAULT_CONFIG: BusinessTypeConfig = {
  label: "Outro negócio",
  professional: "Profissional",
  professionals: "Profissionais",
  service: "Serviço",
  services: "Serviços",
  categories: ["Geral"],
  sampleServices: [
    { name: "Atendimento padrão", duration_minutes: 45, price_cents: 8000, category: "Geral" },
  ],
};

export const BUSINESS_TYPE_CONFIG: Record<BusinessType, BusinessTypeConfig> = {
  BARBERSHOP: {
    label: "Barbearia",
    professional: "Barbeiro",
    professionals: "Barbeiros",
    service: "Serviço",
    services: "Serviços",
    categories: ["Cabelo", "Barba", "Combos", "Estética"],
    sampleServices: [
      { name: "Corte masculino", duration_minutes: 30, price_cents: 4500, category: "Cabelo" },
      { name: "Barba completa", duration_minutes: 30, price_cents: 3500, category: "Barba" },
      { name: "Corte + barba", duration_minutes: 60, price_cents: 7000, category: "Combos" },
    ],
  },
  HAIR_SALON: {
    label: "Salão de cabelo",
    professional: "Cabeleireiro",
    professionals: "Cabeleireiros",
    service: "Serviço",
    services: "Serviços",
    categories: ["Corte", "Coloração", "Tratamentos", "Penteados"],
    sampleServices: [
      { name: "Corte feminino", duration_minutes: 45, price_cents: 7000, category: "Corte" },
      { name: "Escova", duration_minutes: 40, price_cents: 5000, category: "Penteados" },
      { name: "Coloração", duration_minutes: 120, price_cents: 18000, category: "Coloração" },
    ],
  },
  BEAUTY_SALON: {
    label: "Salão de beleza",
    professional: "Profissional",
    professionals: "Profissionais",
    service: "Serviço",
    services: "Serviços",
    categories: ["Cabelo", "Unhas", "Depilação", "Maquiagem"],
    sampleServices: [
      {
        name: "Design de sobrancelha",
        duration_minutes: 30,
        price_cents: 4000,
        category: "Depilação",
      },
      { name: "Maquiagem social", duration_minutes: 60, price_cents: 12000, category: "Maquiagem" },
    ],
  },
  AESTHETIC_CLINIC: {
    label: "Clínica de estética",
    professional: "Especialista",
    professionals: "Especialistas",
    service: "Procedimento",
    services: "Procedimentos",
    categories: ["Facial", "Corporal", "Laser", "Avaliação"],
    sampleServices: [
      {
        name: "Limpeza de pele profunda",
        duration_minutes: 60,
        price_cents: 15000,
        category: "Facial",
      },
      { name: "Avaliação inicial", duration_minutes: 30, price_cents: 0, category: "Avaliação" },
    ],
  },
  NAIL_SALON: {
    label: "Studio de unhas",
    professional: "Manicure",
    professionals: "Manicures",
    service: "Serviço",
    services: "Serviços",
    categories: ["Mãos", "Pés", "Alongamento"],
    sampleServices: [
      { name: "Manicure", duration_minutes: 45, price_cents: 4500, category: "Mãos" },
      { name: "Pedicure", duration_minutes: 50, price_cents: 5000, category: "Pés" },
      {
        name: "Alongamento em gel",
        duration_minutes: 120,
        price_cents: 16000,
        category: "Alongamento",
      },
    ],
  },
  MASSAGE: {
    label: "Massagem e terapias",
    professional: "Terapeuta",
    professionals: "Terapeutas",
    service: "Sessão",
    services: "Sessões",
    categories: ["Relaxante", "Terapêutica", "Corporal"],
    sampleServices: [
      {
        name: "Massagem relaxante 50min",
        duration_minutes: 50,
        price_cents: 13000,
        category: "Relaxante",
      },
      {
        name: "Drenagem linfática",
        duration_minutes: 60,
        price_cents: 15000,
        category: "Corporal",
      },
    ],
  },
  TATTOO: {
    label: "Studio de tatuagem",
    professional: "Tatuador",
    professionals: "Tatuadores",
    service: "Serviço",
    services: "Serviços",
    categories: ["Tatuagem", "Piercing", "Orçamento"],
    sampleServices: [
      { name: "Orçamento presencial", duration_minutes: 30, price_cents: 0, category: "Orçamento" },
      {
        name: "Sessão de tatuagem (2h)",
        duration_minutes: 120,
        price_cents: 40000,
        category: "Tatuagem",
      },
      { name: "Piercing", duration_minutes: 30, price_cents: 12000, category: "Piercing" },
    ],
  },
  THERAPY: {
    label: "Fisioterapia e terapias",
    professional: "Terapeuta",
    professionals: "Terapeutas",
    service: "Sessão",
    services: "Sessões",
    categories: ["Avaliação", "Sessão", "Retorno"],
    sampleServices: [
      {
        name: "Avaliação inicial",
        duration_minutes: 60,
        price_cents: 15000,
        category: "Avaliação",
      },
      {
        name: "Sessão de fisioterapia",
        duration_minutes: 50,
        price_cents: 12000,
        category: "Sessão",
      },
    ],
  },
  OTHER: DEFAULT_CONFIG,
};

export function businessTypeConfig(type: string | null | undefined): BusinessTypeConfig {
  if (type && (BUSINESS_TYPES as readonly string[]).includes(type)) {
    return BUSINESS_TYPE_CONFIG[type as BusinessType];
  }
  return DEFAULT_CONFIG;
}
