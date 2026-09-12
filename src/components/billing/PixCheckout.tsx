import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, Upload } from "lucide-react";
import { createManualPixRequest, getPixCheckout } from "@/lib/manual-pix.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { userFacingError } from "@/lib/user-facing-error";
import { Button } from "@/components/ui/button";

export const PIX_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pagamento em análise",
  APPROVED: "Pagamento aprovado",
  REJECTED: "Pagamento recusado",
  EXPIRED: "Solicitação expirada",
};

/** Manual PIX instructions + "Já fiz o PIX" flow for the selected plan. */
export function PixCheckout({
  planCode,
  interval,
  onDone,
}: {
  planCode: string;
  interval: "MONTHLY" | "ANNUAL";
  onDone?: () => void;
}) {
  const fetchCheckout = useServerFn(getPixCheckout);
  const createRequest = useServerFn(createManualPixRequest);
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [proofPath, setProofPath] = useState<string | null>(null);

  const checkout = useQuery({
    queryKey: ["pix-checkout", planCode, interval],
    queryFn: () => fetchCheckout({ data: { planCode, interval } }),
  });

  const submit = useMutation({
    mutationFn: () =>
      createRequest({
        data: {
          planCode,
          interval,
          ...(note.trim() ? { customerNote: note.trim() } : {}),
          ...(proofPath ? { proofPath } : {}),
        },
      }),
    onSuccess: (result) => {
      if (!result.created) {
        toast.info("Você já possui uma solicitação de pagamento PIX pendente.", {
          description: "Acompanhe o status abaixo. Assim que for analisada, você será avisado.",
        });
      } else {
        toast.success("Solicitação enviada com sucesso!", {
          description:
            "Seu pagamento será analisado pela nossa equipe. Você receberá a confirmação assim que a assinatura for liberada.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["pix-checkout"] });
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
      onDone?.();
    },
    onError: (error: Error) =>
      toast.error("Não foi possível enviar sua solicitação.", {
        description: userFacingError(error, "Tente novamente em alguns instantes."),
      }),
  });

  if (checkout.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando dados do PIX…
      </p>
    );
  }
  if (checkout.isError || !checkout.data) {
    return <p className="text-sm text-destructive">Não foi possível carregar os dados do PIX.</p>;
  }

  const { pix, plan, amountCents, pending, businessId, history } = checkout.data;

  async function uploadProof(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.slice(0, 8) ?? "dat";
      const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("pix-proofs").upload(path, file, { upsert: false });
      if (error) throw error;
      setProofPath(path);
      toast.success("Comprovante anexado");
    } catch {
      toast.error("Não foi possível enviar o comprovante.", {
        description: "Tente novamente em alguns instantes.",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Pagamento via PIX</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Plano: <span className="font-medium text-foreground">{plan.name}</span> · Valor:{" "}
          <span className="font-medium text-foreground">{formatBRL(amountCents)}</span> · Periodicidade:{" "}
          {interval === "ANNUAL" ? "Anual" : "Mensal"}
        </p>
      </div>

      {pix.configured ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">Chave PIX</p>
          <code className="mt-1 block break-all text-sm font-medium text-foreground">{pix.key}</code>
          {pix.holder ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {pix.holder}
              {pix.bank ? ` · ${pix.bank}` : ""}
            </p>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              void navigator.clipboard.writeText(pix.key);
              toast.success("Chave PIX copiada");
            }}
          >
            <Copy className="size-4" aria-hidden /> Copiar PIX
          </Button>
        </div>
      ) : (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          O pagamento via PIX ainda não está disponível. Fale com o suporte.
        </p>
      )}

      <p className="text-sm text-muted-foreground">{pix.instructions}</p>

      {pending ? (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
          <p className="font-semibold text-foreground">Você já possui uma solicitação de pagamento PIX pendente.</p>
          <p className="mt-1 text-muted-foreground">
            {PIX_STATUS_LABEL[pending.status]} · {formatBRL(pending.amount_cents)} · enviada em{" "}
            {new Date(pending.requested_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground" htmlFor="pix-note">
              Observação (opcional)
            </label>
            <textarea
              id="pix-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm"
              placeholder="Ex.: PIX feito pelo banco X às 14h"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm">
              {uploading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-4" aria-hidden />
              )}
              Enviar comprovante
              <input
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadProof(file);
                }}
              />
            </label>
            {proofPath ? <span className="text-sm text-primary">Comprovante anexado</span> : null}
          </div>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !pix.configured}
            className="w-full sm:w-auto"
          >
            {submit.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Já fiz o PIX
          </Button>
        </div>
      )}

      {history.length ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Solicitações PIX</p>
          <ul className="mt-2 space-y-1 text-sm">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-1.5">
                <span className="text-muted-foreground">
                  {new Date(row.created_at).toLocaleDateString("pt-BR")} · {formatBRL(row.amount_cents)}
                </span>
                <span className="font-medium text-foreground">{PIX_STATUS_LABEL[row.status] ?? row.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
