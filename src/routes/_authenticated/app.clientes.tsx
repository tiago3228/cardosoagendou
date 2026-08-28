import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery } from "./app";
import { formatWhatsapp } from "@/lib/format";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/app/clientes")({
  component: ClientsPage,
});

function ClientsPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const businessId = panel.business!.id;
  const [term, setTerm] = useState("");

  const clients = useQuery({
    queryKey: ["clients", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, whatsapp, email, notes, created_at")
        .eq("business_id", businessId)
        .order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const filtered = (clients.data ?? []).filter((client) =>
    `${client.name} ${client.whatsapp}`.toLowerCase().includes(term.toLowerCase()),
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-foreground">Clientes</h1>
      <p className="text-sm text-muted-foreground">{clients.data?.length ?? 0} cadastrados</p>

      <Input
        className="mt-5"
        placeholder="Buscar por nome ou WhatsApp"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      <ul className="mt-5 space-y-2">
        {filtered.map((client) => (
          <li key={client.id} className="rounded-xl border border-border bg-card p-4">
            <p className="font-medium text-card-foreground">{client.name}</p>
            <p className="text-sm text-muted-foreground">{formatWhatsapp(client.whatsapp)}</p>
            {client.email ? <p className="text-sm text-muted-foreground">{client.email}</p> : null}
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado. Clientes são criados automaticamente nos agendamentos.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
