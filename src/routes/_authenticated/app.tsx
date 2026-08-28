import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, CreditCard, LogOut, Package, Scissors, Settings, Users, UserSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyPanel } from "@/lib/panel.functions";
import { Button } from "@/components/ui/button";

export const panelQuery = queryOptions({ queryKey: ["panel"], queryFn: () => getMyPanel() });

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
  { to: "/app/produtos", label: "Produtos", icon: Package },
  { to: "/app/assinatura", label: "Assinatura", icon: CreditCard },
  { to: "/app/configuracoes", label: "Ajustes", icon: Settings },
] as const;

function PanelLayout() {
  const { data } = useSuspenseQuery(panelQuery);
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-background pb-20 md:flex md:pb-0">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar p-5 md:block">
        <span className="font-display text-lg font-bold text-sidebar-foreground">Agendou</span>
        <p className="mt-1 truncate text-sm text-muted-foreground">{data.business.name}</p>
        <nav className="mt-6 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: "exact" in item }}
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          ))}
          {master.data?.isMaster ? (
            <Link
              to="/master/pagamentos"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              Pagamentos PIX
            </Link>
          ) : null}
        </nav>
        <div className="mt-8 rounded-lg border border-sidebar-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano</p>
          <p className="text-sm font-semibold text-sidebar-foreground">{plan?.name ?? "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.usage?.activeProfessionals} profissional(is) ativo(s)
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-6 w-full justify-start"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          <LogOut className="size-4" aria-hidden /> Sair
        </Button>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-border px-5 py-4 md:hidden">
          <span className="font-display font-bold">{data.business.name}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-4" aria-hidden />
          </Button>
        </header>
        <div className="mx-auto max-w-5xl px-5 py-6">
          <Outlet />
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-between border-t border-border bg-card px-2 py-2 md:hidden">
        {NAV.slice(0, 5).map((item) => (
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
