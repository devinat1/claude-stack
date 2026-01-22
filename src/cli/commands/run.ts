import chalk from 'chalk';
import ora from 'ora';
import { loadStack } from '../../core/stack-manager.js';
import { executeStack, getStackExecutionStatus } from '../../core/executor.js';
import { getExecutionOrder } from '../../core/dependency-graph.js';
import { resetStackStatus } from '../../storage/status-store.js';
import { loadPlanById } from '../../core/plan-parser.js';

interface RunOptions {
  dryRun?: boolean;
  from?: string;
  reset?: boolean;
  claude?: string;
}

export const runCommand = async ({
  stackName,
  options,
}: {
  stackName: string;
  options: RunOptions;
}): Promise<void> => {
  const stack = await loadStack({ stackName });

  if (!stack) {
    console.log(chalk.red(`Stack '${stackName}' not found.`));
    return;
  }

  // Check if already running
  const currentStatus = await getStackExecutionStatus({ stackName });
  if (currentStatus?.isRunning) {
    console.log(chalk.yellow(`Stack '${stackName}' is already running.`));
    return;
  }

  // Reset status if requested
  if (options.reset) {
    const planIds = stack.plans.map((p) => p.planId);
    await resetStackStatus({ stackName, planIds });
    console.log(chalk.dim('Reset all plan statuses to pending.'));
  }

  // Get execution order
  const { sortedPlanIds, hasCycle, cycleNodes } = getExecutionOrder({
    stackPlans: stack.plans,
  });

  if (hasCycle) {
    console.log(chalk.red('Cannot execute: dependency cycle detected.'));
    console.log(chalk.dim(`Cycle: ${cycleNodes?.join(' -> ')}`));
    return;
  }

  // Filter from specific plan if requested
  const executionOrder = options.from
    ? sortedPlanIds.slice(sortedPlanIds.indexOf(options.from))
    : sortedPlanIds;

  if (options.from && !sortedPlanIds.includes(options.from)) {
    console.log(chalk.red(`Plan '${options.from}' not found in stack.`));
    return;
  }

  // Dry run mode - just show execution order
  if (options.dryRun) {
    await showDryRun({ stackName, executionOrder });
    return;
  }

  // Execute the stack
  await executeStackWithProgress({
    stackName,
    executionOrder,
    claudeCommand: options.claude,
    fromPlanId: options.from,
  });
};

const showDryRun = async ({
  stackName,
  executionOrder,
}: {
  stackName: string;
  executionOrder: string[];
}): Promise<void> => {
  console.log(chalk.bold(`Dry run for stack: ${stackName}`));
  console.log(chalk.dim('Plans will be executed in this order:'));
  console.log();

  for (let i = 0; i < executionOrder.length; i++) {
    const planId = executionOrder[i];
    const plan = await loadPlanById({ planId });
    const title = plan?.title ?? planId;

    console.log(`  ${chalk.cyan(`${i + 1}.`)} ${planId}`);
    console.log(chalk.dim(`     ${title}`));
  }

  console.log();
  console.log(chalk.dim(`Total: ${executionOrder.length} plans`));
  console.log();
  console.log(`Run with: ${chalk.cyan(`cc run ${stackName}`)}`);
};

const executeStackWithProgress = async ({
  stackName,
  executionOrder,
  claudeCommand,
  fromPlanId,
}: {
  stackName: string;
  executionOrder: string[];
  claudeCommand?: string;
  fromPlanId?: string;
}): Promise<void> => {
  console.log(chalk.bold(`Executing stack: ${stackName}`));
  console.log(chalk.dim(`${executionOrder.length} plans to execute`));
  console.log();

  const spinner = ora({ spinner: 'dots' });

  const { results } = await executeStack({
    stackName,
    dryRun: false,
    fromPlanId,
    claudeCommand: claudeCommand ?? 'claude',
    callbacks: {
      onPlanStart: (planId) => {
        spinner.start(`Executing: ${planId}`);
      },
      onPlanComplete: (planId, status, durationMs) => {
        const duration = formatDuration(durationMs);

        if (status === 'completed') {
          spinner.succeed(`${chalk.green('✓')} ${planId} ${chalk.dim(`(${duration})`)}`);
        } else if (status === 'failed') {
          spinner.fail(`${chalk.red('✗')} ${planId} ${chalk.dim(`(${duration})`)}`);
        } else if (status === 'skipped') {
          spinner.warn(`${chalk.dim('○')} ${planId} ${chalk.dim('(skipped)')}`);
        }
      },
      onPlanError: (planId, error) => {
        spinner.fail(`${chalk.red('✗')} ${planId}`);
        console.log(chalk.red(`   Error: ${error}`));
      },
      onOutput: () => {
        // Output is collected in results - add --verbose flag to stream
      },
    },
  });

  // Summary
  console.log();
  console.log(chalk.dim('─'.repeat(50)));

  const completed = results.filter((r) => r.executionStatus === 'completed').length;
  const failed = results.filter((r) => r.executionStatus === 'failed').length;
  const skipped = results.filter((r) => r.executionStatus === 'skipped').length;

  if (failed === 0) {
    console.log(chalk.green(`✓ All ${completed} plans completed successfully.`));
  } else {
    console.log(
      `${chalk.green(`${completed} completed`)} | ` +
        `${chalk.red(`${failed} failed`)} | ` +
        `${chalk.dim(`${skipped} skipped`)}`
    );
  }

  // Show failed plans
  if (failed > 0) {
    console.log();
    console.log(chalk.red('Failed plans:'));
    results
      .filter((r) => r.executionStatus === 'failed')
      .forEach((r) => {
        console.log(`  ${chalk.red('✗')} ${r.planId}`);
        if (r.errorMessage) {
          console.log(chalk.dim(`    ${r.errorMessage}`));
        }
      });
  }
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};
