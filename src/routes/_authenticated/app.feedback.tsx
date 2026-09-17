import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery } from "./app";
import { BackButton } from "@/components/BackButton";
import { userFacingError } from "@/lib/user-facing-error";

export const Route = createFileRoute("/_authenticated/app/feedback")({
  component: FeedbackPage,
});

type FeedbackRow = {
  id: string;
  category: string;
  message: string;
  master_response: string | null;
  responded_at: string | null;
  created_at: string;
};

const categoryLabels: Record<string, string> = {
  sugestao: "Sugestão",
  problema: "Problema",
  duvida: "Dúvida",
};

function FeedbackPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const business = panel.business!;
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("sugestao");
  const [message, setMessage] = useState("");

  const feedback = useQuery({
    queryKey: ["feedback-submissions", business.id],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("feedback_submissions" as never)
        .select("id, category, message, master_response, responded_at, created_at")
        .eq("business_id", business.id)
        .gte("created_at", startOfMonth.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as FeedbackRow[];
    },
  });

  const sendFeedback = useMutation({
    mutationFn: async () => {
      const trimmed = message.trim();
      if (trimmed.length < 10) throw new Error("Escreva pelo menos 10 caracteres no feedback.");
      if ((feedback.data?.length ?? 0) >= 2)
        throw new Error("Você já utilizou os 2 feedbacks deste mês.");
      const { error } = await supabase.from("feedback_submissions" as never).insert({
        business_id: business.id,
        category,
        message: trimmed,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setMessage("");
      toast.success("Feedback enviado", {
        description: "Obrigado por ajudar a melhorar o Agendou.",
      });
      await queryClient.invalidateQueries({ queryKey: ["feedback-submissions", business.id] });
    },
    onError: (error: Error) => {
      const description = error.message.includes("monthly_feedback_limit_reached")
        ? "Você já utilizou os 2 feedbacks deste mês. A cota será renovada no próximo mês."
        : userFacingError(error);
      toast.error("Não foi possível enviar", { description });
    },
  });

  const used = feedback.data?.length ?? 0;
  const remaining = Math.max(0, 2 - used);

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie sugestões, problemas ou dúvidas para ajudar a evoluir o Agendou.
        </p>
      </div>

      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <MessageSquare className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 className="font-semibold text-foreground">Você tem 2 feedbacks por mês</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Neste mês, você já enviou <strong className="text-foreground">{used} de 2</strong>{" "}
              feedbacks e ainda pode enviar <strong className="text-foreground">{remaining}</strong>
              . A cota é renovada no primeiro dia de cada mês.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Enviar novo feedback</h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            sendFeedback.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="feedback-category">Tipo</Label>
            <select
              id="feedback-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={remaining === 0}
            >
              <option value="sugestao">Sugestão de melhoria</option>
              <option value="problema">Relatar um problema</option>
              <option value="duvida">Dúvida sobre uma funcionalidade</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="feedback-message">Mensagem</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Conte como podemos melhorar o Agendou..."
              maxLength={2000}
              rows={6}
              disabled={remaining === 0}
            />
            <p className="text-right text-xs text-muted-foreground">{message.length}/2000</p>
          </div>
          <Button type="submit" disabled={sendFeedback.isPending || remaining === 0}>
            <Send className="size-4" aria-hidden />
            {remaining === 0 ? "Limite mensal atingido" : "Enviar feedback"}
          </Button>
        </form>
      </section>

      {used > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground">Feedbacks enviados neste mês</h2>
          <div className="mt-4 space-y-3">
            {(feedback.data ?? []).map((item) => (
              <article key={item.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {categoryLabels[item.category] ?? item.category}
                  </span>
                  <time className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString("pt-BR")}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.message}
                </p>
                {item.master_response ? (
                  <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Resposta do Agendou
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                      {item.master_response}
                    </p>
                    {item.responded_at ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Respondido em {new Date(item.responded_at).toLocaleString("pt-BR")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
