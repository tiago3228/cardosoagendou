import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, History, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery, entitlementsQuery } from "./app";
import { formatBRL } from "@/lib/format";
import { userFacingError } from "@/lib/user-facing-error";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoField } from "@/components/ui/photo-field";

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
  const financeEnabled =
    ((entitlements?.features ?? {}) as Record<string, unknown>)["finance"] === true;
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "",
    supplier: "",
    price: "",
    cost: "",
    stock: "0",
    min: "0",
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ["products", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, category, supplier, price_cents, cost_cents, stock_quantity, min_stock, active, image_url")
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
        sku: form.sku.trim() || null,
        category: form.category.trim() || null,
        supplier: form.supplier.trim() || null,
        price_cents: Math.round(Number(form.price.replace(",", ".")) * 100) || 0,
        cost_cents: Math.round(Number(form.cost.replace(",", ".")) * 100) || 0,
        stock_quantity: Number(form.stock) || 0,
        min_stock: Number(form.min) || 0,
        image_url: photo,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setForm({ name: "", sku: "", category: "", supplier: "", price: "", cost: "", stock: "0", min: "0" });
      setPhoto(null);
      toast.success("Produto criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["products", businessId] });
    },
    onError: (error: Error) => toast.error("Não foi possível salvar", { description: userFacingError(error) }),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", businessId] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
    },
    onError: (error: Error) =>
      toast.error("Movimentação recusada", {
        description: userFacingError(error, "Estoque insuficiente para essa saída."),
      }),
  });

  /** Sale = stock exit + revenue entry (revenue only on the Unlimited plan). */
  const sell = useMutation({
    mutationFn: async (product: { id: string; name: string; price_cents: number }) => {
      const movement = await supabase.from("stock_movements").insert({
        business_id: businessId,
        product_id: product.id,
        type: "OUT",
        quantity: 1,
        reason: `Venda: ${product.name}`,
      });
      if (movement.error) throw new Error(movement.error.message);
      if (financeEnabled && product.price_cents > 0) {
        const entry = await supabase.from("transactions").insert({
          business_id: businessId,
          type: "PRODUCT_INCOME",
          amount_cents: product.price_cents,
          description: `Venda de ${product.name}`,
          category: "Produtos",
          occurred_at: new Date().toISOString(),
        });
        if (entry.error) throw new Error(entry.error.message);
      }
    },
    onSuccess: () => {
      toast.success("Venda registrada");
      queryClient.invalidateQueries({ queryKey: ["products", businessId] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível registrar a venda", {
        description: userFacingError(error, "Estoque insuficiente para essa venda."),
      }),
  });

  const setProductPhoto = useMutation({
    mutationFn: async (input: { id: string; url: string | null }) => {
      const { error } = await supabase
        .from("products")
        .update({ image_url: input.url })
        .eq("id", input.id)
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Foto do produto atualizada!");
      queryClient.invalidateQueries({ queryKey: ["products", businessId] });
    },
    onError: (error: Error) => toast.error("Não foi possível atualizar a foto", { description: userFacingError(error) }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("products")
        .update({ deleted_at: new Date().toISOString(), active: false })
        .eq("id", id)
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Produto removido");
      queryClient.invalidateQueries({ queryKey: ["products", businessId] });
    },
    onError: (error: Error) => toast.error("Não foi possível remover", { description: userFacingError(error) }),
  });

  if (!inventoryEnabled) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <BackButton />
        <h1 className="font-display text-2xl font-bold text-foreground">Produtos e vendas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este módulo é exclusivo do plano Ilimitado. Faça upgrade da assinatura para cadastrar
          produtos, controlar estoque e oferecê-los na sua página de reservas.
        </p>
        <Button asChild className="mt-4">
          <Link to="/app/assinatura">Ver planos</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <BackButton />
      <h1 className="font-display text-2xl font-bold text-foreground">Produtos e vendas</h1>
      <p className="text-sm text-muted-foreground">
        Produtos com estoque aparecem na sua página de reservas para retirada no local.
      </p>

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
        <div className="sm:col-span-2">
          <PhotoField
            businessId={businessId}
            folder="produtos"
            value={photo}
            onChange={setPhoto}
            label="Foto do produto"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Código / SKU</Label>
          <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Input
            list="produto-categorias"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <datalist id="produto-categorias">
            {["Cabelo", "Barba", "Pele", "Unhas", "Bebidas", "Acessórios"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Fornecedor</Label>
          <Input
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          />
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

      <Input
        className="mt-6"
        placeholder="Buscar por nome, código, categoria ou fornecedor"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      <ul className="mt-4 space-y-2">
        {(products.data ?? [])
          .filter((product) =>
            `${product.name} ${product.sku ?? ""} ${product.category ?? ""} ${product.supplier ?? ""}`
              .toLowerCase()
              .includes(term.toLowerCase()),
          )
          .map((product) => (
          <li key={product.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="size-12 rounded-lg object-cover"
                  />
                ) : null}
                <div>
                  <p className="font-medium text-card-foreground">{product.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatBRL(product.price_cents)} · estoque {product.stock_quantity}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      product.sku ? `Cód. ${product.sku}` : null,
                      product.category,
                      product.supplier,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {product.stock_quantity <= product.min_stock ? (
                    <p className="mt-1 flex items-center gap-1 text-sm text-destructive">
                      <AlertTriangle className="size-3.5" aria-hidden /> Estoque baixo
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => sell.mutate(product)}
                  disabled={product.stock_quantity < 1}
                >
                  <ShoppingCart className="size-4" aria-hidden /> Vender
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Registrar saída"
                  onClick={() => move.mutate({ productId: product.id, type: "OUT" })}
                >
                  <Minus className="size-4" aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Registrar entrada"
                  onClick={() => move.mutate({ productId: product.id, type: "IN" })}
                >
                  <Plus className="size-4" aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Histórico de ${product.name}`}
                  onClick={() =>
                    setOpenHistory((current) => (current === product.id ? null : product.id))
                  }
                >
                  <History className="size-4" aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remover ${product.name}`}
                  onClick={() => remove.mutate(product.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
            <div className="mt-3">
              <PhotoField
                businessId={businessId}
                folder="produtos"
                value={product.image_url}
                onChange={(url) => setProductPhoto.mutate({ id: product.id, url })}
                label="Foto"
              />
            </div>
            {openHistory === product.id ? (
              <StockHistory businessId={businessId} productId={product.id} />
            ) : null}
          </li>
          ))}
      </ul>
    </div>
  );
}

const MOVEMENT_LABEL: Record<string, string> = {
  IN: "Entrada",
  OUT: "Saída",
  ADJUST: "Ajuste",
};

/** Stock history for one product — every movement is immutable in the database. */
function StockHistory({ businessId, productId }: { businessId: string; productId: string }) {
  const movements = useQuery({
    queryKey: ["stock-movements", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, type, quantity, reason, created_at")
        .eq("business_id", businessId)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return data;
    },
  });

  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Histórico de estoque
      </p>
      <ul className="mt-2 space-y-1.5">
        {(movements.data ?? []).map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {new Date(m.created_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {m.reason ? ` · ${m.reason}` : ""}
            </span>
            <span className="font-medium text-foreground">
              {MOVEMENT_LABEL[m.type] ?? m.type} {m.type === "OUT" ? "-" : "+"}
              {m.quantity}
            </span>
          </li>
        ))}
        {(movements.data ?? []).length === 0 ? (
          <li className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</li>
        ) : null}
      </ul>
    </div>
  );
}
