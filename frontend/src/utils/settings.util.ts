import type { ModelOption } from '@/types/settings.types';

export const getModelEffort = (model: ModelOption | undefined, effort: string): string => {
  const options = model?.reasoning.supportedEfforts ?? [];
  if (options.includes(effort)) return effort;
  const defaultEffort = model?.reasoning.defaultEffort;
  return defaultEffort && options.includes(defaultEffort) ? defaultEffort : options[0] ?? 'none';
};

export const filterCatalogOptions = <T extends { id: string; name: string }>(options: T[], search: string): T[] => {
  const keywords = search.toLowerCase().trim().split(/\s+/);
  return options.filter((option) => keywords.every((word) => `${option.id} ${option.name}`.toLowerCase().includes(word)));
};