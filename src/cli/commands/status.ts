import chalk from 'chalk';
import { loadStack, listStacks } from '../../core/stack-manager.js';
import { loadStackStatus } from '../../storage/status-store.js';
import { loadPlanById } from '../../core/plan-parser.js';
import type { ExecutionStatus } from '../../types/index.js';

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  pending: 'pending',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  skipped: 'skipped',
};

const STATUS_COLORS: Record<ExecutionStatus, (text: string) => string> = {
  pending: chalk.gray,
  running: chalk.yellow,
  completed: chalk.green,
  failed: chalk.red,
  skipped: chalk.dim,
};

export const statusCommand = async ({
  stackName,
}: {
  stackName?: string;
}): Promise<void> => {
  if (stackName) {
    await showStackStatus({ stackName });
  } else {
    await showAllStacksStatus();
  }
};

const showAllStacksStatus = async (): Promise<void> => {
  const stacks = await listStacks();

  if (stacks.length === 0) {
    console.log(chalk.gray('No stacks found.'));
    return;
  }

  console.log(chalk.bold('Stack Status Summary:'));
  console.log();

  for (const stack of stacks) {
    const planIds = stack.plans.map((p) => p.planId);
    const status = await loadStackStatus({ stackName: stack.stackName, planIds });

    const counts = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    Object.values(status.planStatuses).forEach((ps) => {
      counts[ps.executionStatus]++;
    });

    const total = stack.plans.length;
    const progressBar = createProgressBar({ counts, total });

    console.log(`${chalk.cyan(stack.stackName)} ${progressBar}`);
    console.log(
      `  ${chalk.green(`✓ ${counts.completed}`)} ${chalk.red(`✗ ${counts.failed}`)} ${chalk.yellow(`◉ ${counts.running}`)} ${chalk.gray(`◯ ${counts.pending}`)} ${chalk.dim(`○ ${counts.skipped}`)}`
    );

    if (status.lastRunAt) {
      const lastRun = new Date(status.lastRunAt);
      console.log(chalk.dim(`  Last run: ${lastRun.toLocaleString()}`));
    }

    console.log();
  }
};

const showStackStatus = async ({
  stackName,
}: {
  stackName: string;
}): Promise<void> => {
  const stack = await loadStack({ stackName });

  if (!stack) {
    console.log(chalk.red(`Stack '${stackName}' not found.`));
    return;
  }

  const planIds = stack.plans.map((p) => p.planId);
  const status = await loadStackStatus({ stackName, planIds });

  console.log(chalk.bold(`Stack: ${stackName}`));
  if (stack.stackDescription) {
    console.log(chalk.dim(stack.stackDescription));
  }
  console.log();

  if (status.isRunning) {
    console.log(chalk.yellow('⚡ Currently running'));
    console.log();
  }

  // Load plan titles
  const planTitles = new Map<string, string>();
  await Promise.all(
    planIds.map(async (planId) => {
      const plan = await loadPlanById({ planId });
      if (plan) {
        planTitles.set(planId, plan.title);
      }
    })
  );

  // Sort by execution order based on dependencies
  const sortedPlans = [...stack.plans].sort((planA, planB) => {
    const aHasDeps = planA.dependsOnPlanIds.length > 0;
    const bHasDeps = planB.dependsOnPlanIds.length > 0;
    if (aHasDeps !== bHasDeps) return aHasDeps ? 1 : -1;
    return planA.planId.localeCompare(planB.planId);
  });

  for (const stackPlan of sortedPlans) {
    const planStatus = status.planStatuses[stackPlan.planId];
    const executionStatus = planStatus?.executionStatus ?? 'pending';
    const colorFn = STATUS_COLORS[executionStatus];
    const statusLabel = STATUS_LABELS[executionStatus];
    const title = planTitles.get(stackPlan.planId) ?? stackPlan.planId;

    console.log(`${colorFn(`[${statusLabel.padEnd(9)}]`)} ${stackPlan.planId}`);
    console.log(chalk.dim(`             ${title}`));

    if (planStatus?.lastExecutedAt) {
      const lastRun = new Date(planStatus.lastExecutedAt);
      const duration = planStatus.executionDurationMs
        ? `(${formatDuration(planStatus.executionDurationMs)})`
        : '';
      console.log(
        chalk.dim(`             Last run: ${lastRun.toLocaleString()} ${duration}`)
      );
    }

    if (planStatus?.errorMessage && executionStatus === 'failed') {
      console.log(chalk.red(`             Error: ${planStatus.errorMessage}`));
    }

    console.log();
  }

  // Summary
  const counts = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  Object.values(status.planStatuses).forEach((ps) => {
    counts[ps.executionStatus]++;
  });

  console.log(chalk.dim('─'.repeat(50)));
  console.log(
    `Total: ${stack.plans.length} plans | ` +
      `${chalk.green(`${counts.completed} completed`)} | ` +
      `${chalk.red(`${counts.failed} failed`)} | ` +
      `${chalk.gray(`${counts.pending} pending`)}`
  );
};

const createProgressBar = ({
  counts,
  total,
  width = 20,
}: {
  counts: Record<ExecutionStatus, number>;
  total: number;
  width?: number;
}): string => {
  const completed = Math.round((counts.completed / total) * width);
  const failed = Math.round((counts.failed / total) * width);
  const running = Math.round((counts.running / total) * width);
  const pending = width - completed - failed - running;

  return (
    chalk.green('█'.repeat(completed)) +
    chalk.red('█'.repeat(failed)) +
    chalk.yellow('█'.repeat(running)) +
    chalk.gray('░'.repeat(Math.max(0, pending)))
  );
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};
