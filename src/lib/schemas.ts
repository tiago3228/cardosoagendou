import { z } from "zod";
import { BUSINESS_TYPES } from "./business-types";
import { normalizeBrWhatsapp } from "./format";

export const whatsappSchema = z
  .string()
  .min(8, "Informe seu WhatsApp")
  .max(30)
  .refine((v) => normalizeBrWhatsapp(v) !== null, {
    message: "WhatsApp inválido. Use o formato 55 (31) 97541-4498",
  });

export const signupSchema = z.object({
  businessName: z.string().trim().min(2, "Informe o nome do negócio").max(80),
  ownerName: z.string().trim().min(2, "Informe seu nome").max(80),
  email: z.string().trim().email("E-mail inválido").max(160),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(72),
  whatsapp: whatsappSchema,
  businessType: z.enum(BUSINESS_TYPES),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const provisionSchema = signupSchema.omit({ email: true, password: true });

export const availabilitySchema = z.object({
  slug: z.string().trim().min(1).max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  serviceIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um serviço").max(10),
  professionalId: z.string().uuid().nullable().optional(),
});

export const publicBookingSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  professionalId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1).max(10),
  startsAt: z.string().datetime({ offset: true }),
  clientName: z.string().trim().min(2, "Informe seu nome").max(80),
  whatsapp: whatsappSchema,
  notes: z.string().trim().max(500).optional(),
});

export const planChangeSchema = z.object({
  planCode: z.string().trim().min(1).max(40),
  interval: z.enum(["MONTHLY", "ANNUAL"]),
});

export const checkoutSchema = planChangeSchema.extend({
  method: z.enum(["PIX", "CREDIT_CARD"]),
});

export const appointmentStatusSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELED", "NO_SHOW"]),
  reason: z.string().trim().max(300).optional(),
});

export const rescheduleSchema = z.object({
  appointmentId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  professionalId: z.string().uuid().optional(),
});

export const manualAppointmentSchema = z.object({
  businessId: z.string().uuid(),
  professionalId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1).max(10),
  startsAt: z.string().datetime({ offset: true }),
  clientName: z.string().trim().min(2).max(80),
  whatsapp: whatsappSchema,
  notes: z.string().trim().max(500).optional(),
});

/** Allowed appointment status transitions (state machine). */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELED", "NO_SHOW"],
  CONFIRMED: ["IN_PROGRESS", "COMPLETED", "CANCELED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "CANCELED"],
  COMPLETED: [],
  CANCELED: [],
  NO_SHOW: [],
};

export function canTransition(from: string, to: string): boolean {
  return (STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/** Manual PIX (paid directly to the SaaS owner, approved by the Master). */
export const pixQuoteSchema = planChangeSchema;

export const manualPixRequestSchema = planChangeSchema.extend({
  customerNote: z.string().trim().max(500).optional(),
  /** Storage path inside the private "pix-proofs" bucket. */
  proofPath: z.string().trim().max(300).optional(),
});

export const pixReviewSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["APPROVE", "REJECT"]),
  adminNote: z.string().trim().max(500).optional(),
});
