import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.claude-stack');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface Config {
  plansDirectory: string;
  defaultClaude: string;
  autoResolveDependencies: boolean;
}

const DEFAULT_CONFIG: Config = {
  plansDirectory: join(homedir(), '.claude', 'plans'),
  defaultClaude: 'claude',
  autoResolveDependencies: true,
};

/**
 * Ensure the config directory exists
 */
export const ensureConfigDir = async (): Promise<void> => {
  await mkdir(CONFIG_DIR, { recursive: true });
  await mkdir(join(CONFIG_DIR, 'stacks'), { recursive: true });
  await mkdir(join(CONFIG_DIR, 'status'), { recursive: true });
};

/**
 * Check if the config directory has been initialized
 */
export const isInitialized = async (): Promise<boolean> => {
  try {
    await access(CONFIG_DIR);
    return true;
  } catch {
    return false;
  }
};

/**
 * Load the config file
 */
export const loadConfig = async (): Promise<Config> => {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    const userConfig = JSON.parse(content) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...userConfig };
  } catch {
    return DEFAULT_CONFIG;
  }
};

/**
 * Save the config file
 */
export const saveConfig = async ({
  config,
}: {
  config: Config;
}): Promise<void> => {
  await ensureConfigDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
};

/**
 * Get the config directory path
 */
export const getConfigDir = (): string => CONFIG_DIR;
