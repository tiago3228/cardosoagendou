export interface ServiceComposition {
  composite_service_id: string;
  component_service_id: string;
}

export type ServiceSelectionIssue = "duplicate" | "composition" | null;

export function serviceSelectionIssue(
  serviceIds: string[],
  compositions: ServiceComposition[],
): ServiceSelectionIssue {
  if (new Set(serviceIds).size !== serviceIds.length) return "duplicate";
  const selected = new Set(serviceIds);
  return compositions.some(
    ({ composite_service_id: composite, component_service_id: component }) =>
      selected.has(composite) && selected.has(component),
  )
    ? "composition"
    : null;
}
