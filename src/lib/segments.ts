export type SegmentPlanCode = "BASIC" | "MEDIUM" | "UNLIMITED" | string;

/** NULL means unlimited. Trialing accounts receive the full catalog entitlement. */
export function segmentLimit(input: {
  planCode: SegmentPlanCode | null | undefined;
  subscriptionStatus?: string | null;
}): number | null {
  if (input.subscriptionStatus === "TRIALING") return null;
  switch (input.planCode?.toUpperCase()) {
    case "UNLIMITED":
      return null;
    case "MEDIUM":
      return 2;
    case "BASIC":
    default:
      return 1;
  }
}

export function segmentSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
