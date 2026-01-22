import chalk from 'chalk';
import { listStacks, loadStack } from '../../core/stack-manager.js';
import { loadStackStatus } from '../../storage/status-store.js';
import { loadPlanById } from '../../core/plan-parser.js';
import { getExecutionOrder } from '../../core/dependency-graph.js';
import type { StackPlan, ExecutionStatus } from '../../types/index.js';

const STATUS_ICONS: Record<ExecutionStatus, string> = {
  pending: '◯',
  running: '◉',
  completed: '●',
  failed: '✗',
  skipped: '○',
};

const STATUS_COLORS: Record<ExecutionStatus, (text: string) => string> = {
  pending: chalk.gray,
  running: chalk.yellow,
  completed: chalk.green,
  failed: chalk.red,
  skipped: chalk.dim,
};

interface TreeNode {
  planId: string;
  title: string;
  executionStatus: ExecutionStatus;
  children: TreeNode[];
  depth: number;
}

const MAX_TREE_DEPTH = 10;
const MAX_PLANS_FOR_TREE = 30;

/**
 * Build a tree structure from stack plans with depth limiting
 */
const buildTree = ({
  stackPlans,
  rootPlanIds,
  planTitles,
  statuses,
}: {
  stackPlans: StackPlan[];
  rootPlanIds: string[];
  planTitles: Map<string, string>;
  statuses: Record<string, ExecutionStatus>;
}): TreeNode[] => {
  const planMap = new Map(stackPlans.map((p) => [p.planId, p]));

  // Find which plans depend on each plan (reverse mapping)
  const dependentMap = new Map<string, string[]>();
  stackPlans.forEach((plan) => {
    plan.dependsOnPlanIds.forEach((depId) => {
      const existing = dependentMap.get(depId) ?? [];
      dependentMap.set(depId, [...existing, plan.planId]);
    });
  });

  // Track which plans have been shown to avoid duplicates
  const shownInTree = new Set<string>();

  const buildNode = (
    planId: string,
    visited: Set<string>,
    depth: number
  ): TreeNode | null => {
    if (visited.has(planId)) return null;
    if (depth > MAX_TREE_DEPTH) return null;

    visited.add(planId);

    const plan = planMap.get(planId);
    if (!plan) return null;

    shownInTree.add(planId);

    const dependents = dependentMap.get(planId) ?? [];
    const children = dependents
      .filter((depId) => !visited.has(depId))
      .map((depId) => buildNode(depId, new Set(visited), depth + 1))
      .filter((node): node is TreeNode => node !== null);

    return {
      planId,
      title: planTitles.get(planId) ?? planId,
      executionStatus: statuses[planId] ?? 'pending',
      children,
      depth,
    };
  };

  // Build trees starting from roots, avoiding duplicates
  const trees: TreeNode[] = [];
  rootPlanIds.forEach((rootId) => {
    if (!shownInTree.has(rootId)) {
      const node = buildNode(rootId, new Set(), 0);
      if (node) {
        trees.push(node);
      }
    }
  });

  return trees;
};

/**
 * Render a tree node with ASCII art
 */
const renderTree = ({
  nodes,
  prefix = '',
}: {
  nodes: TreeNode[];
  prefix?: string;
}): string[] => {
  const lines: string[] = [];

  nodes.forEach((node, index) => {
    const isNodeLast = index === nodes.length - 1;
    const icon = STATUS_ICONS[node.executionStatus];
    const colorFn = STATUS_COLORS[node.executionStatus];

    const connector = prefix === '' ? '' : isNodeLast ? '└─' : '├─';
    const hasChildren = node.children.length > 0;
    const nodePrefix = hasChildren ? '┬─' : '── ';

    const line = `${prefix}${connector}${colorFn(icon)}${nodePrefix}${node.planId}`;
    lines.push(line);

    if (hasChildren) {
      const childPrefix =
        prefix + (prefix === '' ? '' : isNodeLast ? '  ' : '│ ');
      const childLines = renderTree({
        nodes: node.children,
        prefix: childPrefix + '│ ',
      });
      lines.push(...childLines);
    }
  });

  return lines;
};

/**
 * Render a flat list of plans in execution order
 */
const renderFlatList = ({
  stackPlans,
  planTitles,
  statuses,
}: {
  stackPlans: StackPlan[];
  planTitles: Map<string, string>;
  statuses: Record<string, ExecutionStatus>;
}): string[] => {
  const { sortedPlanIds, hasCycle } = getExecutionOrder({ stackPlans });

  const lines: string[] = [];

  if (hasCycle) {
    lines.push(chalk.yellow('Note: Dependency cycle detected. Showing unsorted list.'));
    lines.push('');

    stackPlans.forEach((plan, index) => {
      const icon = STATUS_ICONS[statuses[plan.planId] ?? 'pending'];
      const colorFn = STATUS_COLORS[statuses[plan.planId] ?? 'pending'];
      const title = planTitles.get(plan.planId) ?? '';
      const deps = plan.dependsOnPlanIds.length;

      lines.push(
        `${chalk.dim(`${(index + 1).toString().padStart(3)}.`)} ${colorFn(icon)} ${plan.planId}${deps > 0 ? chalk.dim(` (${deps} deps)`) : ''}`
      );
      if (title && title !== plan.planId) {
        lines.push(`      ${chalk.dim(title)}`);
      }
    });
  } else {
    lines.push(chalk.dim('Plans in execution order:'));
    lines.push('');

    sortedPlanIds.forEach((planId, index) => {
      const icon = STATUS_ICONS[statuses[planId] ?? 'pending'];
      const colorFn = STATUS_COLORS[statuses[planId] ?? 'pending'];
      const title = planTitles.get(planId) ?? '';
      const plan = stackPlans.find((p) => p.planId === planId);
      const deps = plan?.dependsOnPlanIds.length ?? 0;

      lines.push(
        `${chalk.dim(`${(index + 1).toString().padStart(3)}.`)} ${colorFn(icon)} ${planId}${deps > 0 ? chalk.dim(` (${deps} deps)`) : ''}`
      );
      if (title && title !== planId) {
        lines.push(`      ${chalk.dim(title)}`);
      }
    });
  }

  return lines;
};

/**
 * List all stacks or show details of a specific stack
 */
export const lsCommand = async ({
  stackName,
}: {
  stackName?: string;
}): Promise<void> => {
  if (stackName) {
    await showStackTree({ stackName });
  } else {
    await listAllStacks();
  }
};

/**
 * List all stacks with summary info
 */
const listAllStacks = async (): Promise<void> => {
  const stacks = await listStacks();

  if (stacks.length === 0) {
    console.log(chalk.gray('No stacks found.'));
    console.log();
    console.log(
      `Create one with: ${chalk.cyan('cc create <stack-name> -p <plan-id>')}`
    );
    return;
  }

  console.log(chalk.bold('Stacks:'));
  console.log();

  for (const stack of stacks) {
    const planIds = stack.plans.map((p) => p.planId);
    const status = await loadStackStatus({
      stackName: stack.stackName,
      planIds,
    });

    const completed = Object.values(status.planStatuses).filter(
      (s) => s.executionStatus === 'completed'
    ).length;
    const total = stack.plans.length;
    const running = status.isRunning;

    const statusText = running
      ? chalk.yellow('running')
      : completed === total
        ? chalk.green('completed')
        : chalk.gray(`${completed}/${total}`);

    console.log(
      `  ${chalk.cyan(stack.stackName)} ${chalk.dim(`(${total} plans)`)} ${statusText}`
    );

    if (stack.stackDescription) {
      console.log(`    ${chalk.dim(stack.stackDescription)}`);
    }
  }

  console.log();
  console.log(`View stack details: ${chalk.cyan('cc ls <stack-name>')}`);
};

/**
 * Show tree visualization of a specific stack
 */
const showStackTree = async ({
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

  const statuses = Object.fromEntries(
    Object.entries(status.planStatuses).map(([id, s]) => [
      id,
      s.executionStatus,
    ])
  );

  console.log(chalk.bold(`Stack: ${stackName}`));
  if (stack.stackDescription) {
    console.log(chalk.dim(stack.stackDescription));
  }
  console.log();

  // Use flat list for large stacks, tree for small ones
  if (stack.plans.length > MAX_PLANS_FOR_TREE) {
    console.log(
      chalk.dim(
        `(Showing flat list - ${stack.plans.length} plans exceeds tree limit)`
      )
    );
    console.log();
    const flatLines = renderFlatList({
      stackPlans: stack.plans,
      planTitles,
      statuses,
    });
    flatLines.forEach((line) => console.log(line));
  } else {
    const tree = buildTree({
      stackPlans: stack.plans,
      rootPlanIds: stack.rootPlanIds,
      planTitles,
      statuses,
    });

    const treeLines = renderTree({ nodes: tree });
    treeLines.forEach((line) => console.log(line));
  }

  console.log();
  console.log(chalk.dim('Legend:'));
  console.log(
    `  ${STATUS_COLORS.pending(STATUS_ICONS.pending)} pending  ${STATUS_COLORS.running(STATUS_ICONS.running)} running  ${STATUS_COLORS.completed(STATUS_ICONS.completed)} completed  ${STATUS_COLORS.failed(STATUS_ICONS.failed)} failed  ${STATUS_COLORS.skipped(STATUS_ICONS.skipped)} skipped`
  );
};
