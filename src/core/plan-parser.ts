import matter from 'gray-matter';
import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import type { Plan, PlanType, ParsedFrontmatter } from '../types/index.js';
import { TYPE_PREFIX_MAP } from '../types/index.js';

const DEFAULT_PLANS_DIR = join(homedir(), '.claude', 'plans');

/**
 * Extract wiki-link content from strings like '[[some-plan-name]]'
 */
const extractWikiLink = (wikiLink: string): string => {
  const match = wikiLink.match(/\[\[([^\]]+)\]\]/);
  return match ? match[1] : wikiLink;
};

/**
 * Parse wiki-links from an array of strings
 */
const parseWikiLinks = (links: string[] | undefined): string[] => {
  if (!links || links.length === 0) {
    return [];
  }
  return links.map(extractWikiLink);
};

/**
 * Extract plan type and title from H1 heading
 */
const extractTitleAndType = ({
  content,
}: {
  content: string;
}): { title: string; planType: PlanType } => {
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('# ')) {
      const fullTitle = line.slice(2).trim();

      for (const [prefix, planType] of Object.entries(TYPE_PREFIX_MAP)) {
        if (fullTitle.startsWith(prefix)) {
          return { title: fullTitle, planType };
        }
      }

      return { title: fullTitle, planType: 'note' };
    }
  }

  return { title: '', planType: 'note' };
};

/**
 * Parse a single plan file and extract metadata
 */
export const parsePlanFile = async ({
  filePath,
}: {
  filePath: string;
}): Promise<Plan> => {
  const fileContent = await readFile(filePath, 'utf-8');
  const { data, content } = matter(fileContent);
  const frontmatter = data as ParsedFrontmatter;

  const planId = basename(filePath, '.md');
  const { title, planType } = extractTitleAndType({ content });
  const references = parseWikiLinks(frontmatter.references);
  const concepts = parseWikiLinks(frontmatter.concepts);

  return {
    planId,
    filePath,
    title,
    planType,
    references,
    concepts,
    content: fileContent,
  };
};

/**
 * Load all plans from the plans directory
 */
export const loadAllPlans = async ({
  plansDirectory = DEFAULT_PLANS_DIR,
}: {
  plansDirectory?: string;
} = {}): Promise<Plan[]> => {
  const files = await readdir(plansDirectory);
  const markdownFiles = files.filter(
    (file) => file.endsWith('.md') && !file.startsWith('.')
  );

  const plans = await Promise.all(
    markdownFiles.map((file) =>
      parsePlanFile({ filePath: join(plansDirectory, file) })
    )
  );

  return plans;
};

/**
 * Load a specific plan by its ID
 */
export const loadPlanById = async ({
  planId,
  plansDirectory = DEFAULT_PLANS_DIR,
}: {
  planId: string;
  plansDirectory?: string;
}): Promise<Plan | null> => {
  const filePath = join(plansDirectory, `${planId}.md`);

  try {
    return await parsePlanFile({ filePath });
  } catch {
    return null;
  }
};

/**
 * Search plans by title, type, or concept
 */
export const searchPlans = async ({
  query,
  planType,
  plansDirectory = DEFAULT_PLANS_DIR,
}: {
  query?: string;
  planType?: PlanType;
  plansDirectory?: string;
}): Promise<Plan[]> => {
  const allPlans = await loadAllPlans({ plansDirectory });

  return allPlans.filter((plan) => {
    const matchesQuery =
      !query ||
      plan.title.toLowerCase().includes(query.toLowerCase()) ||
      plan.planId.toLowerCase().includes(query.toLowerCase());

    const matchesType = !planType || plan.planType === planType;

    return matchesQuery && matchesType;
  });
};

/**
 * Get the default plans directory path
 */
export const getPlansDirectory = (): string => DEFAULT_PLANS_DIR;
