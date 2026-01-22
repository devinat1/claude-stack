import { spawn } from 'child_process';
import { loadPlanById } from './plan-parser.js';
import { loadStack, updateStackPlanStatus } from './stack-manager.js';
import { getExecutionOrder } from './dependency-graph.js';
import {
  loadStackStatus,
  updatePlanStatus,
  setStackRunning,
} from '../storage/status-store.js';
import type { ExecutionStatus, StackExecutionStatus } from '../types/index.js';

interface ExecutionCallbacks {
  onPlanStart?: (planId: string) => void;
  onPlanComplete?: (
    planId: string,
    status: ExecutionStatus,
    durationMs: number
  ) => void;
  onPlanError?: (planId: string, error: string) => void;
  onOutput?: (planId: string, data: string) => void;
}

interface ExecuteStackOptions {
  stackName: string;
  dryRun?: boolean;
  fromPlanId?: string;
  callbacks?: ExecutionCallbacks;
  claudeCommand?: string;
}

interface ExecutePlanResult {
  planId: string;
  executionStatus: ExecutionStatus;
  exitCode: number | null;
  errorMessage: string | null;
  executionDurationMs: number;
  output: string;
}

/**
 * Execute a single plan using claude -p
 */
export const executePlan = async ({
  planId,
  claudeCommand = 'claude',
  callbacks,
}: {
  planId: string;
  claudeCommand?: string;
  callbacks?: ExecutionCallbacks;
}): Promise<ExecutePlanResult> => {
  const plan = await loadPlanById({ planId });

  if (!plan) {
    return {
      planId,
      executionStatus: 'failed',
      exitCode: 1,
      errorMessage: `Plan '${planId}' not found.`,
      executionDurationMs: 0,
      output: '',
    };
  }

  const startTime = Date.now();
  callbacks?.onPlanStart?.(planId);

  return new Promise((resolve) => {
    const outputChunks: string[] = [];

    const process = spawn(claudeCommand, ['-p', plan.content], {
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      outputChunks.push(text);
      callbacks?.onOutput?.(planId, text);
    });

    process.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      outputChunks.push(text);
      callbacks?.onOutput?.(planId, text);
    });

    process.on('error', (error) => {
      const durationMs = Date.now() - startTime;
      callbacks?.onPlanError?.(planId, error.message);
      callbacks?.onPlanComplete?.(planId, 'failed', durationMs);

      resolve({
        planId,
        executionStatus: 'failed',
        exitCode: 1,
        errorMessage: error.message,
        executionDurationMs: durationMs,
        output: outputChunks.join(''),
      });
    });

    process.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      const executionStatus: ExecutionStatus =
        code === 0 ? 'completed' : 'failed';

      callbacks?.onPlanComplete?.(planId, executionStatus, durationMs);

      resolve({
        planId,
        executionStatus,
        exitCode: code,
        errorMessage: code !== 0 ? `Process exited with code ${code}` : null,
        executionDurationMs: durationMs,
        output: outputChunks.join(''),
      });
    });
  });
};

/**
 * Execute all plans in a stack in dependency order
 */
export const executeStack = async ({
  stackName,
  dryRun = false,
  fromPlanId,
  callbacks,
  claudeCommand = 'claude',
}: ExecuteStackOptions): Promise<{
  results: ExecutePlanResult[];
  executionOrder: string[];
}> => {
  const stack = await loadStack({ stackName });

  if (!stack) {
    throw new Error(`Stack '${stackName}' not found.`);
  }

  const { sortedPlanIds, hasCycle, cycleNodes } = getExecutionOrder({
    stackPlans: stack.plans,
  });

  if (hasCycle) {
    throw new Error(
      `Dependency cycle detected: ${cycleNodes?.join(' -> ') ?? 'unknown'}`
    );
  }

  // Filter to start from a specific plan if specified
  const executionOrder = fromPlanId
    ? sortedPlanIds.slice(sortedPlanIds.indexOf(fromPlanId))
    : sortedPlanIds;

  if (dryRun) {
    return {
      results: [],
      executionOrder,
    };
  }

  const planIds = stack.plans.map((p) => p.planId);
  await setStackRunning({ stackName, planIds, isRunning: true });

  const results: ExecutePlanResult[] = [];
  const completedPlanIds = new Set<string>();

  // Load current status to check for already completed plans
  const currentStatus = await loadStackStatus({ stackName, planIds });
  stack.plans.forEach((sp) => {
    const planStatus = currentStatus.planStatuses[sp.planId];
    if (planStatus?.executionStatus === 'completed') {
      completedPlanIds.add(sp.planId);
    }
  });

  for (const planId of executionOrder) {
    // Skip if already completed
    if (completedPlanIds.has(planId)) {
      continue;
    }

    // Check if all dependencies are completed
    const stackPlan = stack.plans.find((p) => p.planId === planId);
    const hasUnmetDependencies = stackPlan?.dependsOnPlanIds.some(
      (depId) => !completedPlanIds.has(depId)
    );

    if (hasUnmetDependencies) {
      await updatePlanStatus({
        stackName,
        planIds,
        planId,
        executionStatus: 'skipped',
        errorMessage: 'Skipped due to failed dependencies.',
      });

      await updateStackPlanStatus({
        stackName,
        planId,
        updates: { executionStatus: 'skipped' },
      });

      results.push({
        planId,
        executionStatus: 'skipped',
        exitCode: null,
        errorMessage: 'Skipped due to failed dependencies.',
        executionDurationMs: 0,
        output: '',
      });

      continue;
    }

    // Mark as running
    await updatePlanStatus({
      stackName,
      planIds,
      planId,
      executionStatus: 'running',
    });

    await updateStackPlanStatus({
      stackName,
      planId,
      updates: { executionStatus: 'running' },
    });

    // Execute the plan
    const result = await executePlan({
      planId,
      claudeCommand,
      callbacks,
    });

    // Update status
    await updatePlanStatus({
      stackName,
      planIds,
      planId,
      executionStatus: result.executionStatus,
      errorMessage: result.errorMessage,
      exitCode: result.exitCode,
      executionDurationMs: result.executionDurationMs,
    });

    await updateStackPlanStatus({
      stackName,
      planId,
      updates: {
        executionStatus: result.executionStatus,
        lastExecutedAt: new Date().toISOString(),
        executionDurationMs: result.executionDurationMs,
      },
    });

    results.push(result);

    if (result.executionStatus === 'completed') {
      completedPlanIds.add(planId);
    }
  }

  await setStackRunning({ stackName, planIds, isRunning: false });

  return {
    results,
    executionOrder,
  };
};

/**
 * Get the current execution status of a stack
 */
export const getStackExecutionStatus = async ({
  stackName,
}: {
  stackName: string;
}): Promise<StackExecutionStatus | null> => {
  const stack = await loadStack({ stackName });

  if (!stack) {
    return null;
  }

  const planIds = stack.plans.map((p) => p.planId);
  return loadStackStatus({ stackName, planIds });
};
