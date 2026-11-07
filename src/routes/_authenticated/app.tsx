import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  BellRing,
  CircleHelp,
  CreditCard,
  Gem,
  Download,
  FileText,
  KanbanSquare,
  LogOut,
  MessageSquare,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Package,
  Scissors,
  Settings,
  Sun,
  Users,
  UserSquare,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyPanel } from "@/lib/panel.functions";
import { getMasterStatus } from "@/lib/manual-pix.functions";
import { getMyEntitlements } from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useInstallApp } from "@/lib/use-install-app";

export const panelQuery = queryOptions({ queryKey: ["panel"], queryFn: () => getMyPanel() });

/** Entitlements drive which modules the plan unlocks (enforced in the database too). */
export const entitlementsQuery = queryOptions({
  queryKey: ["entitlements"],
  queryFn: () => getMyEntitlements(),
});

export type ScheduledAppointmentAlert = {
  id: string;
  starts_at: string;
  status: string;
  client_name: string;
  client_whatsapp: string;
  appointment_services: { service_name: string }[];
};

export const scheduledAppointmentsQuery = (businessId: string) => ({
  queryKey: ["scheduled-alert", businessId],
  refetchInterval: 15_000,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, starts_at, status, client_name, client_whatsapp, appointment_services(service_name)",
      )
      .eq("business_id", businessId)
      .in("status", ["PENDING", "CONFIRMED", "IN_PROGRESS"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as ScheduledAppointmentAlert[];
  },
});

export const Route = createFileRoute("/_authenticated/app")({
  loader: ({ context }) => context.queryClient.ensureQueryData(panelQuery),
  head: () => ({
    meta: [
      { title: "Painel — Agendou" },
      { name: "description", content: "Gerencie agenda, equipe, clientes e assinatura." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PanelLayout,
});

const NAV = [
  { to: "/app", label: "Agenda", icon: CalendarDays, exact: true },
  { to: "/app/servicos", label: "Serviços", icon: Scissors },
  { to: "/app/profissionais", label: "Equipe", icon: UserSquare },
  { to: "/app/clientes", label: "Clientes", icon: Users },
  { to: "/app/crm", label: "CRM", icon: KanbanSquare, feature: "crm" },
  { to: "/app/orcamentos", label: "Orçamentos", icon: FileText },
  { to: "/app/produtos", label: "Produtos", icon: Package, feature: "inventory" },
  { to: "/app/faturamento", label: "Faturamento", icon: Wallet, feature: "finance" },
  { to: "/app/assinatura", label: "Assinatura", icon: CreditCard },
  { to: "/app/feedback", label: "Feedback", icon: MessageSquare },
  { to: "/app/como-funciona", label: "Como funciona", icon: CircleHelp },
  { to: "/app/configuracoes", label: "Ajustes", icon: Settings },
] as const;

type PanelTheme = "dark" | "clean";
const PANEL_THEME_KEY = "agendou-panel-theme";

function PanelLayout() {
  const { data } = useSuspenseQuery(panelQuery);
  const navigate = useNavigate();
  const master = useQuery({ queryKey: ["master-status"], queryFn: () => getMasterStatus() });
  const entitlements = useQuery(entitlementsQuery);
  const scheduled = useQuery({
    ...scheduledAppointmentsQuery(data.business?.id ?? ""),
    enabled: !!data.business?.id,
  });
  const queryClient = useQueryClient();
  const features = (entitlements.data?.features ?? {}) as Record<string, unknown>;
  const nav = NAV.filter((item) => !("feature" in item) || features[item.feature] === true);
  const [theme, setTheme] = useState<PanelTheme>("dark");
  const { installed, install, manualHint } = useInstallApp();
  const [installHint, setInstallHint] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  async function handleInstall() {
    if (installed) return;
    const outcome = await install();
    if (outcome === "accepted") {
      toast.success("Aplicativo instalado com sucesso.");
      return;
    }
    setInstallHint(true);
    if (outcome === "unsupported")
      toast.info("A instalação automática não está disponível neste navegador.", {
        description: manualHint,
        duration: 8000,
      });
  }

  useEffect(() => {
    const businessId = data.business?.id;
    if (!businessId) return;

    const channel = supabase
      .channel(`business-appointments-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: ["scheduled-alert", businessId] });
          void queryClient.invalidateQueries({ queryKey: ["agenda"] });
          void queryClient.invalidateQueries({ queryKey: ["agenda-revenue"] });
          void queryClient.invalidateQueries({ queryKey: ["finance"] });
          const appointment = payload.new as { client_name?: string; status?: string };
          const clientName = appointment.client_name ?? "Um cliente";
          if (payload.eventType === "INSERT") {
            toast.success("Novo agendamento recebido", {
              description: `${clientName} acabou de enviar um agendamento.`,
            });
          } else if (payload.eventType === "UPDATE" && appointment.status === "CANCELED") {
            toast.warning("Agendamento cancelado pelo cliente", {
              description: `${clientName} cancelou um agendamento.`,
            });
          } else if (payload.eventType === "UPDATE") {
            toast.info("Agendamento atualizado", {
              description: `A resposta de ${clientName} já está refletida na agenda.`,
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data.business?.id, queryClient]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(PANEL_THEME_KEY);
    if (savedTheme === "clean" || savedTheme === "dark") setTheme(savedTheme);
    setSidebarCollapsed(window.localStorage.getItem("agendou-sidebar-collapsed") === "true");
  }, []);

  function selectTheme(nextTheme: PanelTheme) {
    setTheme(nextTheme);
    window.localStorage.setItem(PANEL_THEME_KEY, nextTheme);
  }

  if (!data.business) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Nenhum negócio vinculado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Conclua o cadastro do seu negócio para acessar o painel.
          </p>
          <Button asChild className="mt-6">
            <Link to="/cadastro">Cadastrar negócio</Link>
          </Button>
        </div>
      </main>
    );
  }

  const plan = data.subscription?.plans as { name?: string } | null | undefined;

  return (
    <div
      className={`agenda-theme panel-layout ${theme === "clean" ? "agenda-theme-clean" : ""} min-h-dvh bg-background text-foreground lg:flex`}
    >
      <aside className={`sticky top-0 hidden h-dvh shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar transition-[width] motion-reduce:transition-none lg:flex lg:flex-col ${sidebarCollapsed ? "w-20 p-3" : "w-60 p-5"}`}>
        <Button variant="ghost" size="icon" className="mb-3 self-end text-sidebar-foreground" aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"} title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"} aria-expanded={!sidebarCollapsed} onClick={() => {
          const next = !sidebarCollapsed;
          setSidebarCollapsed(next);
          window.localStorage.setItem("agendou-sidebar-collapsed", String(next));
        }}>{sidebarCollapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}</Button>
        <Link
          to="/"
          className="font-display text-xl font-bold text-sidebar-foreground transition-opacity hover:opacity-75"
          aria-label="Ir para a tela principal do Agendou"
        >
          {sidebarCollapsed ? "A" : "Agendou"}
        </Link>
        <p className={`${sidebarCollapsed ? "hidden" : ""} mt-1 truncate text-sm text-muted-foreground`}>{data.business.name}</p>
        {data.business.diamond_access && !sidebarCollapsed ? (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-300">
            <Gem className="size-3" aria-hidden /> Diamante
          </span>
        ) : null}
        <nav className="mt-7 space-y-1.5">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              title={sidebarCollapsed ? item.label : undefined}
              aria-label={item.label}
              activeOptions={{ exact: "exact" in item }}
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
              className={`flex items-center gap-3 rounded-md py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent ${sidebarCollapsed ? "justify-center px-2" : "px-3"}`}
            >
              <item.icon className="size-4" aria-hidden />
              <span className={sidebarCollapsed ? "sr-only" : ""}>{item.label}</span>
            </Link>
          ))}
          {master.data?.isMaster ? (
            <Link
              to="/master/feedback"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <Gem className="size-4 shrink-0" aria-hidden /><span className={sidebarCollapsed ? "sr-only" : ""}>Administração Master</span>
            </Link>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start gap-3 text-sidebar-foreground"
            onClick={() => void handleInstall()}
            disabled={installed}
            title={installed ? "Aplicativo já instalado" : "Instalar aplicativo"}
          >
            <Download className="size-4" aria-hidden />
            <span className={sidebarCollapsed ? "sr-only" : ""}>{installed ? "Aplicativo já instalado" : "Instalar aplicativo"}</span>
          </Button>
          {installHint && !installed ? (
            <p className="mt-2 rounded-md bg-sidebar-accent/50 p-2 text-[11px] leading-relaxed text-sidebar-foreground/70">
              {manualHint}
            </p>
          ) : null}
        </nav>
        <div className={`${sidebarCollapsed ? "hidden" : ""} mt-auto rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-3`}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano</p>
          <p className="flex items-center gap-1 text-sm font-semibold text-sidebar-foreground">
            {data.business.diamond_access ? (
              <Gem className="size-4 text-amber-500" aria-hidden />
            ) : null}
            {data.business.diamond_access ? "Diamante" : (plan?.name ?? "—")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.usage?.activeProfessionals} profissional(is) ativo(s)
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full justify-start text-sidebar-foreground"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          <LogOut className="size-4" aria-hidden /> <span className={sidebarCollapsed ? "sr-only" : ""}>Sair</span>
        </Button>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="panel-header grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:gap-3 lg:px-8 lg:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="Abrir menu"><Menu aria-hidden /></Button>
              </SheetTrigger>
              <SheetContent side="left" className={`agenda-theme ${theme === "clean" ? "agenda-theme-clean" : ""} w-[min(88vw,360px)] overflow-y-auto px-4 pb-8`}>
                <SheetHeader className="pr-10 text-left">
                  <SheetTitle>Agendou</SheetTitle>
                  <SheetDescription className="break-words">{data.business.name}</SheetDescription>
                </SheetHeader>
                <nav className="mt-5 grid gap-1" aria-label="Menu completo">
                  {nav.map((item) => (
                    <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)} activeOptions={{ exact: "exact" in item }} activeProps={{ className: "bg-secondary text-primary" }} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium">
                      <item.icon className="size-5 shrink-0" aria-hidden />{item.label}
                    </Link>
                  ))}
                  {master.data?.isMaster ? <Link to="/master/feedback" onClick={() => setMenuOpen(false)} className="flex min-h-11 items-center rounded-md px-3 text-sm">Administração Master</Link> : null}
                  <Button variant="ghost" className="mt-3 justify-start" onClick={() => void handleInstall()} disabled={installed}><Download aria-hidden />{installed ? "Aplicativo já instalado" : "Instalar aplicativo"}</Button>
                  {installHint && !installed ? <p className="px-3 text-sm text-muted-foreground">{manualHint}</p> : null}
                </nav>
              </SheetContent>
            </Sheet>
            <span className="min-w-0 truncate font-display font-bold">{data.business.name}</span>
          </div>
          <div className="col-span-2 flex shrink-0 items-center justify-between gap-1 sm:col-span-1 sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-2.5 sm:hidden"
              onClick={() => void handleInstall()}
              disabled={installed}
              aria-label={installed ? "Aplicativo já instalado" : "Instalar aplicativo"}
              title={installed ? "Aplicativo já instalado" : "Instalar aplicativo"}
            >
              <Download className="size-4" aria-hidden />
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className={`h-9 gap-2 px-2.5 text-xs sm:px-3 ${scheduled.data?.length ? "animate-pulse border-red-500 bg-red-500/10 text-red-600 dark:text-red-400" : "border-emerald-500 bg-emerald-500/10 text-emerald-600"}`}
              title={
                scheduled.data?.length
                  ? `${scheduled.data.length} cliente(s) agendado(s)`
                  : "Nenhum cliente agendado"
              }
            >
              <Link to="/app/agendados">
                <BellRing className="size-4" aria-hidden />
                <span className="hidden sm:inline">Clientes agendados</span>
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-current/15 px-1.5 py-0.5 font-bold">
                  {scheduled.data?.length ?? 0}
                </span>
              </Link>
            </Button>
            <div
              className="flex items-center rounded-md border border-border bg-secondary/65 p-1"
              aria-label="Aparência do painel"
            >
              <Button
                type="button"
                variant={theme === "dark" ? "default" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5"
                aria-pressed={theme === "dark"}
                aria-label="Usar modo escuro"
                onClick={() => selectTheme("dark")}
              >
                <Moon className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">Escuro</span>
              </Button>
              <Button
                type="button"
                variant={theme === "clean" ? "default" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5"
                aria-pressed={theme === "clean"}
                aria-label="Usar modo claro"
                onClick={() => selectTheme("clean")}
              >
                <Sun className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">Clean</span>
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Sair"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" aria-hidden />{" "}
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-7">
          <Outlet />
        </div>
      </div>

      <nav aria-label="Navegação rápida" className="panel-bottom-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card px-2 pt-2 lg:hidden">
        {nav.slice(0, 4).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: "exact" in item }}
            activeProps={{ className: "text-primary" }}
            className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground"
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        ))}
        <Button variant="ghost" className="h-auto min-h-12 flex-col gap-1 px-1 text-[11px] text-muted-foreground" onClick={() => setMenuOpen(true)}><Menu className="size-5" aria-hidden />Mais</Button>
      </nav>
    </div>
  );
}
