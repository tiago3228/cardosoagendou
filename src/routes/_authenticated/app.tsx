import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CircleHelp,
  CreditCard,
  FileText,
  LogOut,
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
import { useEffect, useState } from "react";

export const panelQuery = queryOptions({ queryKey: ["panel"], queryFn: () => getMyPanel() });

/** Entitlements drive which modules the plan unlocks (enforced in the database too). */
export const entitlementsQuery = queryOptions({
  queryKey: ["entitlements"],
  queryFn: () => getMyEntitlements(),
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
  { to: "/app/orcamentos", label: "Orçamentos", icon: FileText },
  { to: "/app/produtos", label: "Produtos", icon: Package, feature: "inventory" },
  { to: "/app/faturamento", label: "Faturamento", icon: Wallet, feature: "finance" },
  { to: "/app/assinatura", label: "Assinatura", icon: CreditCard },
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
  const features = (entitlements.data?.features ?? {}) as Record<string, unknown>;
  const nav = NAV.filter((item) => !("feature" in item) || features[item.feature] === true);
  const [theme, setTheme] = useState<PanelTheme>("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(PANEL_THEME_KEY);
    if (savedTheme === "clean" || savedTheme === "dark") setTheme(savedTheme);
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
      className={`agenda-theme ${theme === "clean" ? "agenda-theme-clean" : ""} min-h-screen bg-background pb-20 text-foreground md:flex md:pb-0`}
    >
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar p-5 md:flex md:flex-col">
        <span className="font-display text-xl font-bold text-sidebar-foreground">Agendou</span>
        <p className="mt-1 truncate text-sm text-muted-foreground">{data.business.name}</p>
        <nav className="mt-7 space-y-1.5">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: "exact" in item }}
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          ))}
          {master.data?.isMaster ? (
            <Link
              to="/master/pagamentos"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              Pagamentos PIX
            </Link>
          ) : null}
          {master.data?.isMaster ? (
            <Link
              to="/master/planos"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              Testar planos
            </Link>
          ) : null}
        </nav>
        <div className="mt-auto rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano</p>
          <p className="text-sm font-semibold text-sidebar-foreground">{plan?.name ?? "—"}</p>
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
          <LogOut className="size-4" aria-hidden /> Sair
        </Button>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8 md:py-4">
          <span className="min-w-0 truncate font-display font-bold">{data.business.name}</span>
          <div className="flex shrink-0 items-center gap-2">
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
        <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-7 md:py-7">
          <Outlet />
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-between border-t border-border bg-card px-2 py-2 md:hidden">
        {nav.slice(0, 5).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: "exact" in item }}
            activeProps={{ className: "text-primary" }}
            className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium text-muted-foreground"
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
