import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { getConfigDir, ensureConfigDir } from './config.js';
import type {
  StackExecutionStatus,
  PlanExecutionStatus,
  ExecutionStatus,
} from '../types/index.js';

const getStatusDir = (): string => join(getConfigDir(), 'status');

/**
 * Create a default execution status for a stack
 */
const createDefaultStatus = ({
  stackName,
  planIds,
}: {
  stackName: string;
  planIds: string[];
}): StackExecutionStatus => ({
  stackName,
  planStatuses: Object.fromEntries(
    planIds.map((planId) => [
      planId,
      {
        planId,
        executionStatus: 'pending' as ExecutionStatus,
        lastExecutedAt: null,
        executionDurationMs: null,
        errorMessage: null,
        exitCode: null,
      },
    ])
  ),
  lastRunAt: null,
  isRunning: false,
});

/**
 * Load execution status for a stack
 */
export const loadStackStatus = async ({
  stackName,
  planIds,
}: {
  stackName: string;
  planIds: string[];
}): Promise<StackExecutionStatus> => {
  const filePath = join(getStatusDir(), `${stackName}.json`);

  try {
    const content = await readFile(filePath, 'utf-8');
    const status = JSON.parse(content) as StackExecutionStatus;

    // Ensure all plan IDs have a status entry
    planIds.forEach((planId) => {
      if (!status.planStatuses[planId]) {
        status.planStatuses[planId] = {
          planId,
          executionStatus: 'pending',
          lastExecutedAt: null,
          executionDurationMs: null,
          errorMessage: null,
          exitCode: null,
        };
      }
    });

    return status;
  } catch {
    return createDefaultStatus({ stackName, planIds });
  }
};

/**
 * Save execution status for a stack
 */
export const saveStackStatus = async ({
  status,
}: {
  status: StackExecutionStatus;
}): Promise<void> => {
  await ensureConfigDir();
  const filePath = join(getStatusDir(), `${status.stackName}.json`);
  await writeFile(filePath, JSON.stringify(status, null, 2));
};

/**
 * Update a single plan's execution status
 */
export const updatePlanStatus = async ({
  stackName,
  planIds,
  planId,
  executionStatus,
  errorMessage,
  exitCode,
  executionDurationMs,
}: {
  stackName: string;
  planIds: string[];
  planId: string;
  executionStatus: ExecutionStatus;
  errorMessage?: string | null;
  exitCode?: number | null;
  executionDurationMs?: number | null;
}): Promise<void> => {
  const status = await loadStackStatus({ stackName, planIds });

  const planStatus: PlanExecutionStatus = {
    planId,
    executionStatus,
    lastExecutedAt: new Date().toISOString(),
    executionDurationMs: executionDurationMs ?? null,
    errorMessage: errorMessage ?? null,
    exitCode: exitCode ?? null,
  };

  status.planStatuses[planId] = planStatus;
  status.lastRunAt = new Date().toISOString();

  await saveStackStatus({ status });
};

/**
 * Mark stack as running/not running
 */
export const setStackRunning = async ({
  stackName,
  planIds,
  isRunning,
}: {
  stackName: string;
  planIds: string[];
  isRunning: boolean;
}): Promise<void> => {
  const status = await loadStackStatus({ stackName, planIds });
  status.isRunning = isRunning;

  if (isRunning) {
    status.lastRunAt = new Date().toISOString();
  }

  await saveStackStatus({ status });
};

/**
 * Reset all plan statuses to pending
 */
export const resetStackStatus = async ({
  stackName,
  planIds,
}: {
  stackName: string;
  planIds: string[];
}): Promise<void> => {
  const status = createDefaultStatus({ stackName, planIds });
  await saveStackStatus({ status });
};
