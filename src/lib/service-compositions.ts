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

  const componentsByComposite = new Map<string, Set<string>>();
  for (const { composite_service_id: composite, component_service_id: component } of compositions) {
    const components = componentsByComposite.get(composite) ?? new Set<string>();
    components.add(component);
    componentsByComposite.set(composite, components);
  }

  const effectiveSets = serviceIds.map((serviceId) => {
    const components = componentsByComposite.get(serviceId);
    return components && components.size > 0 ? components : new Set([serviceId]);
  });

  for (let left = 0; left < effectiveSets.length; left += 1) {
    for (let right = left + 1; right < effectiveSets.length; right += 1) {
      const leftSet = effectiveSets[left];
      const rightSet = effectiveSets[right];
      if (!leftSet || !rightSet) continue;
      for (const serviceId of leftSet) {
        if (rightSet.has(serviceId)) return "composition";
      }
    }
  }

  return null;
}
