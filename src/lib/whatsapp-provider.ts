export interface WhatsAppMessage {
  to: string;
  template: string;
  payload: Record<string, unknown>;
}

export interface WhatsAppProvider {
  readonly name: string;
  send(message: WhatsAppMessage): Promise<{ providerMessageId: string }>;
}

/** The application queues messages until a real provider is configured. */
export const unconfiguredWhatsAppProvider: WhatsAppProvider = {
  name: "unconfigured",
  async send() {
    throw new Error("WHATSAPP_PROVIDER_NOT_CONFIGURED");
  },
};
