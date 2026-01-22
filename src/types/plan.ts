export type PlanType =
  | 'plan'
  | 'fix'
  | 'note'
  | 'investigation'
  | 'debug'
  | 'refactor'
  | 'feature'
  | 'review'
  | 'learning';

export interface Plan {
  planId: string;
  filePath: string;
  title: string;
  planType: PlanType;
  references: string[];
  concepts: string[];
  content: string;
}

export interface ParsedFrontmatter {
  references?: string[];
  concepts?: string[];
}

export const TYPE_PREFIX_MAP: Record<string, PlanType> = {
  'Plan:': 'plan',
  'Fix:': 'fix',
  'Investigation:': 'investigation',
  'Debugging:': 'debug',
  'Debug:': 'debug',
  'Refactor:': 'refactor',
  'Review:': 'review',
  'Learning:': 'learning',
  'Feature:': 'feature',
};
