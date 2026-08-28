import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { provisionBusiness } from "@/lib/signup.functions";
import { signupSchema } from "@/lib/schemas";
import { BUSINESS_TYPES, BUSINESS_TYPE_CONFIG } from "@/lib/business-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/cadastro")({
  validateSearch: z.object({ plano: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Criar conta — Agendou" },
      {
        name: "description",
        content: "Cadastre seu negócio e comece a receber agendamentos online em minutos.",
      },
      { property: "og:title", content: "Criar conta — Agendou" },
      { property: "og:description", content: "Cadastre seu negócio e receba agendamentos online." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const provision = useServerFn(provisionBusiness);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    email: "",
    password: "",
    whatsapp: "",
    businessType: "BARBERSHOP",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const signUp = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { full_name: parsed.data.ownerName },
        },
      });
      if (signUp.error) throw new Error(signUp.error.message);

      if (!signUp.data.session) {
        const signIn = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (signIn.error) {
          toast.success("Conta criada", {
            description: "Confirme seu e-mail para acessar o painel.",
          });
          navigate({ to: "/auth" });
          return;
        }
      }

      const result = await provision({
        data: {
          businessName: parsed.data.businessName,
          ownerName: parsed.data.ownerName,
          whatsapp: parsed.data.whatsapp,
          businessType: parsed.data.businessType,
        },
      });
      toast.success("Negócio criado!", {
        description: `Sua página de reservas é /${result.slug ?? ""}`,
      });
      navigate({ to: "/app" });
    } catch (error) {
      toast.error("Não foi possível concluir o cadastro", {
        description: error instanceof Error ? error.message.replace(/^[A-Z_]+:\s*/, "") : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="font-display text-xl font-bold text-foreground">
          Agendou
        </Link>
        <h1 className="mt-6 font-display text-2xl font-bold text-foreground">
          Cadastre seu negócio
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          14 dias grátis, sem cartão de crédito. Já tem conta?{" "}
          <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Nome do negócio" error={errors["businessName"]}>
            <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} />
          </Field>

          <Field label="Tipo de negócio" error={errors["businessType"]}>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={form.businessType}
              onChange={(e) => set("businessType", e.target.value)}
            >
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {BUSINESS_TYPE_CONFIG[type].label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Seu nome" error={errors["ownerName"]}>
            <Input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
          </Field>

          <Field label="WhatsApp" error={errors["whatsapp"]} hint="Ex.: 55 (31) 97541-4498">
            <Input
              inputMode="tel"
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
            />
          </Field>

          <Field label="E-mail" error={errors["email"]}>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>

          <Field label="Senha" error={errors["password"]} hint="Mínimo de 8 caracteres">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
          </Field>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Criando..." : "Criar meu negócio"}
          </Button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
