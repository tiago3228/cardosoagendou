import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Sparkles, LoaderCircle, Clock, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWeeklyInsights } from "@/lib/weekly-insights.functions";

export const weeklyInsightsQuery = (businessId: string, weekOffset = 0) => queryOptions({
  queryKey: ["weekly-insights", businessId, weekOffset],
  queryFn: () => getWeeklyInsights({ data: { weekOffset } }),
  staleTime: 60_000,
  retry: false,
});

export function WeeklyInsights({ businessId }: { businessId: string }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const options = weeklyInsightsQuery(businessId, weekOffset);
  const { data } = useSuspenseQuery(options);
  const generate = useServerFn(getWeeklyInsights);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => generate({ data: { weekOffset, generate: true } }),
    onSuccess: (result) => client.setQueryData(options.queryKey, result),
    retry: false,
  });
  if (!data) return null;
  const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const error = mutation.error ? "Não foi possível consultar a análise agora." : data.error;
  const terminal = ["provider_denied", "refusal"].includes(data.blocked ?? "");

  return (
    <section aria-label="Resumo semanal de reservas" className="min-w-0 border-y border-border py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-5 text-primary" aria-hidden /> Resumo semanal</h2>
          <p className="mt-1 text-sm text-muted-foreground">Novas reservas · {formatDate(data.startDate)} a {formatDate(data.endDate)}{weekOffset === 0 ? " · Semana em andamento" : ""}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Resumo da semana anterior" disabled={weekOffset <= -52 || mutation.isPending} onClick={() => setWeekOffset((v) => v - 1)}><ChevronLeft aria-hidden /></Button>
          <Button size="icon" variant="outline" aria-label="Resumo da próxima semana" disabled={weekOffset === 0 || mutation.isPending} onClick={() => setWeekOffset((v) => v + 1)}><ChevronRight aria-hidden /></Button>
        </div>
      </div>
      <div className="mt-4 grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Reservas recebidas</p>
          <p className="mt-1 text-3xl font-bold text-primary">{data.total}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.canceled} canceladas · {data.previousTotal} na semana anterior</p>
        </div>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock className="size-4 text-muted-foreground" aria-hidden /> Horários de pico</h3>
          <ul className="mt-2 space-y-2">{data.peakHours.map((item) => <li key={item.hour} className="flex justify-between gap-3 text-sm"><span>{item.hour}</span><span className="text-muted-foreground">{item.count} reservas</span></li>)}</ul>
          {!data.peakHours.length && <p className="mt-2 text-sm text-muted-foreground">Sem horários neste período.</p>}
        </div>
        <div className="min-w-0 sm:col-span-2 xl:col-span-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Scissors className="size-4 text-muted-foreground" aria-hidden /> Serviços mais agendados</h3>
          <ul className="mt-2 space-y-2">{data.topServices.map((item, i) => <li key={`${item.name}-${i}`} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{item.name}</span><span className="shrink-0 text-muted-foreground">{item.count}</span></li>)}</ul>
          {!data.topServices.length && <p className="mt-2 text-sm text-muted-foreground">Sem serviços neste período.</p>}
        </div>
      </div>
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-primary">Análise da semana · Lovable AI</h3>
          {data.total > 0 && !data.narrative && !terminal && <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}><span>{mutation.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}</span>{mutation.isPending ? "Analisando..." : data.blocked ? "Retomar análise" : "Gerar análise"}</Button>}
        </div>
        <div aria-live="polite" className="mt-2 min-w-0 text-sm leading-relaxed">
          {data.narrative && <p className="whitespace-pre-wrap break-words">{data.narrative}</p>}
          {data.generatedAt && <p className="mt-2 text-xs text-muted-foreground">Gerado em {new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: data.timezone })}</p>}
          {error && <p role="alert" className="text-destructive">{error}</p>}
          {data.total === 0 && <p className="text-muted-foreground">Nenhuma nova reserva recebida nesta semana.</p>}
        </div>
      </div>
    </section>
  );
}