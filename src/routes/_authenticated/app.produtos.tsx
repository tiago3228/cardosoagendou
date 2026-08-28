import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery, entitlementsQuery } from "./app";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/app/produtos")({
  component: ProductsPage,
});

function ProductsPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const { data: entitlements } = useSuspenseQuery(entitlementsQuery);
  const businessId = panel.business!.id;
  const inventoryEnabled =
    ((entitlements?.features ?? {}) as Record<string, unknown>)["inventory"] === true;
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", price: "", cost: "", stock: "0", min: "0" });

  const products = useQuery({
    queryKey: ["products", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price_cents, cost_cents, stock_quantity, min_stock, active")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome do produto");
      const { error } = await supabase.from("products").insert({
        business_id: businessId,
        name: form.name.trim(),
        price_cents: Math.round(Number(form.price.replace(",", ".")) * 100) || 0,
        cost_cents: Math.round(Number(form.cost.replace(",", ".")) * 100) || 0,
        stock_quantity: Number(form.stock) || 0,
        min_stock: Number(form.min) || 0,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setForm({ name: "", price: "", cost: "", stock: "0", min: "0" });
      toast.success("Produto criado");
      queryClient.invalidateQueries({ queryKey: ["products", businessId] });
    },
    onError: (error: Error) => toast.error("Não foi possível salvar", { description: error.message }),
  });

  const move = useMutation({
    mutationFn: async (input: { productId: string; type: "IN" | "OUT" }) => {
      const { error } = await supabase.from("stock_movements").insert({
        business_id: businessId,
        product_id: input.productId,
        type: input.type,
        quantity: 1,
        reason: input.type === "IN" ? "Entrada manual" : "Venda/uso",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products", businessId] }),
    onError: (error: Error) =>
      toast.error("Movimentação recusada", {
        description: error.message.includes("INSUFFICIENT_STOCK")
          ? "Estoque insuficiente para essa saída."
          : error.message,
      }),
  });

  if (!inventoryEnabled) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Produtos e estoque</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este módulo está disponível a partir do plano Médio. Faça upgrade da assinatura para
          controlar produtos, entradas e saídas de estoque.
        </p>
        <Button asChild className="mt-4">
          <Link to="/app/assinatura">Ver planos</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-foreground">Produtos e estoque</h1>
      <p className="text-sm text-muted-foreground">Controle entradas, saídas e estoque mínimo.</p>


      <form
        className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Nome</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Preço de venda (R$)</Label>
          <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Custo (R$)</Label>
          <Input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Estoque inicial</Label>
          <Input value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Estoque mínimo</Label>
          <Input value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            <Plus className="size-4" aria-hidden /> Adicionar produto
          </Button>
        </div>
      </form>

      <ul className="mt-6 space-y-2">
        {(products.data ?? []).map((product) => (
          <li
            key={product.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div>
              <p className="font-medium text-card-foreground">{product.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatBRL(product.price_cents)} · estoque {product.stock_quantity}
              </p>
              {product.stock_quantity <= product.min_stock ? (
                <p className="mt-1 flex items-center gap-1 text-sm text-destructive">
                  <AlertTriangle className="size-3.5" aria-hidden /> Estoque baixo
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => move.mutate({ productId: product.id, type: "OUT" })}
              >
                <Minus className="size-4" aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => move.mutate({ productId: product.id, type: "IN" })}
              >
                <Plus className="size-4" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
