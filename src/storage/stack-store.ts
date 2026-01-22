import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { getConfigDir, ensureConfigDir } from './config.js';
import type { Stack } from '../types/index.js';

const getStacksDir = (): string => join(getConfigDir(), 'stacks');

/**
 * Load a stack by name
 */
export const loadStack = async ({
  stackName,
}: {
  stackName: string;
}): Promise<Stack | null> => {
  const filePath = join(getStacksDir(), `${stackName}.json`);

  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as Stack;
  } catch {
    return null;
  }
};

/**
 * Save a stack to storage
 */
export const saveStack = async ({
  stack,
}: {
  stack: Stack;
}): Promise<void> => {
  await ensureConfigDir();
  const filePath = join(getStacksDir(), `${stack.stackName}.json`);
  await writeFile(filePath, JSON.stringify(stack, null, 2));
};

/**
 * Delete a stack
 */
export const deleteStack = async ({
  stackName,
}: {
  stackName: string;
}): Promise<boolean> => {
  const filePath = join(getStacksDir(), `${stackName}.json`);

  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * List all stacks
 */
export const listStacks = async (): Promise<Stack[]> => {
  try {
    const files = await readdir(getStacksDir());
    const stackFiles = files.filter((file) => file.endsWith('.json'));

    const stacks = await Promise.all(
      stackFiles.map(async (file) => {
        const content = await readFile(join(getStacksDir(), file), 'utf-8');
        return JSON.parse(content) as Stack;
      })
    );

    return stacks;
  } catch {
    return [];
  }
};

/**
 * Check if a stack exists
 */
export const stackExists = async ({
  stackName,
}: {
  stackName: string;
}): Promise<boolean> => {
  const stack = await loadStack({ stackName });
  return stack !== null;
};
