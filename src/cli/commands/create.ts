import chalk from 'chalk';
import inquirer from 'inquirer';
import { CheckboxPlusPrompt } from 'inquirer-ts-checkbox-plus-prompt';
import fuzzy from 'fuzzy';
import {
  createStack,
  addPlansToStack,
  createStackFromPlan,
  stackExists,
} from '../../core/stack-manager.js';
import { loadAllPlans } from '../../core/plan-parser.js';
import { isInitialized } from '../../storage/config.js';

inquirer.registerPrompt('checkbox-plus', CheckboxPlusPrompt);

interface CreateOptions {
  plans?: string[];
  fromPlan?: string;
  description?: string;
  interactive?: boolean;
  deps?: boolean;
}

export const createCommand = async ({
  stackName,
  options,
}: {
  stackName: string;
  options: CreateOptions;
}): Promise<void> => {
  const initialized = await isInitialized();
  if (!initialized) {
    console.log(
      chalk.red('Claude Stack is not initialized. Run `cc init` first.')
    );
    return;
  }

  const exists = await stackExists({ stackName });

  // If --from-plan is specified, create stack from a single plan and its references
  if (options.fromPlan) {
    await createFromPlan({
      stackName,
      planId: options.fromPlan,
      description: options.description,
    });
    return;
  }

  // Interactive mode
  if (options.interactive) {
    await createInteractive({ stackName, description: options.description });
    return;
  }

  // Create or add plans from -p flags
  if (options.plans && options.plans.length > 0) {
    if (exists) {
      await addPlans({
        stackName,
        planIds: options.plans,
        autoResolveDependencies: options.deps !== false,
      });
    } else {
      await createNew({
        stackName,
        planIds: options.plans,
        description: options.description,
        autoResolveDependencies: options.deps !== false,
      });
    }
    return;
  }

  // Default to interactive mode when no plans specified
  await createInteractive({ stackName, description: options.description, exists });
};

const createNew = async ({
  stackName,
  planIds,
  description,
  autoResolveDependencies,
}: {
  stackName: string;
  planIds: string[];
  description?: string;
  autoResolveDependencies: boolean;
}): Promise<void> => {
  try {
    const stack = await createStack({
      stackName,
      stackDescription: description ?? null,
      planIds,
      autoResolveDependencies,
    });

    console.log(chalk.green(`✓ Created stack '${stackName}'`));
    console.log(`  Plans: ${stack.plans.length}`);

    if (autoResolveDependencies && stack.plans.length > planIds.length) {
      console.log(
        chalk.dim(
          `  (${stack.plans.length - planIds.length} additional plans added from references)`
        )
      );
    }

    console.log();
    console.log(`View with: ${chalk.cyan(`cc ls ${stackName}`)}`);
    console.log(`Run with: ${chalk.cyan(`cc run ${stackName}`)}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`Failed to create stack: ${errorMessage}`));
  }
};

const addPlans = async ({
  stackName,
  planIds,
  autoResolveDependencies,
}: {
  stackName: string;
  planIds: string[];
  autoResolveDependencies: boolean;
}): Promise<void> => {
  try {
    const stack = await addPlansToStack({
      stackName,
      planIds,
      autoResolveDependencies,
    });

    console.log(chalk.green(`✓ Added plans to stack '${stackName}'`));
    console.log(`  Total plans: ${stack.plans.length}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`Failed to add plans: ${errorMessage}`));
  }
};

const createFromPlan = async ({
  stackName,
  planId,
  description,
}: {
  stackName: string;
  planId: string;
  description?: string;
}): Promise<void> => {
  try {
    const stack = await createStackFromPlan({
      planId,
      stackName,
      stackDescription: description,
    });

    console.log(chalk.green(`✓ Created stack '${stackName}' from plan '${planId}'`));
    console.log(`  Plans: ${stack.plans.length}`);
    console.log(chalk.dim('  (including all referenced plans)'));
    console.log();
    console.log(`View with: ${chalk.cyan(`cc ls ${stackName}`)}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`Failed to create stack: ${errorMessage}`));
  }
};

const createInteractive = async ({
  stackName,
  description,
  exists = false,
}: {
  stackName: string;
  description?: string;
  exists?: boolean;
}): Promise<void> => {
  const allPlans = await loadAllPlans({});

  if (allPlans.length === 0) {
    console.log(chalk.yellow('No plans found in the plans directory.'));
    return;
  }

  // Sort plans by type then name for easier navigation
  const sortedPlans = [...allPlans].sort((a, b) => {
    if (a.planType !== b.planType) {
      return a.planType.localeCompare(b.planType);
    }
    return a.planId.localeCompare(b.planId);
  });

  console.log(chalk.dim('Type to search, ↑↓ to navigate, Space to select, Enter to confirm'));
  console.log();

  const { selectedPlans } = await inquirer.prompt<{ selectedPlans: string[] }>([
    {
      type: 'checkbox-plus' as const,
      name: 'selectedPlans',
      message: exists
        ? `Select plans to add to '${stackName}':`
        : `Select plans for new stack '${stackName}':`,
      pageSize: 20,
      highlight: true,
      searchable: true,
      source: async (_answersSoFar: unknown, input: string | undefined) => {
        const searchTerm = input ?? '';
        if (searchTerm === '') {
          return sortedPlans.map((plan) => ({
            name: `${plan.planId} - ${plan.title}`,
            value: plan.planId,
            short: plan.planId,
          }));
        }
        const results = fuzzy.filter(searchTerm, sortedPlans, {
          extract: (plan) => `${plan.planId} ${plan.title}`,
        });
        return results.map((result) => ({
          name: `${result.original.planId} - ${result.original.title}`,
          value: result.original.planId,
          short: result.original.planId,
        }));
      },
    },
  ] as Parameters<typeof inquirer.prompt>[0]);

  if (selectedPlans.length === 0) {
    console.log(chalk.yellow('No plans selected.'));
    return;
  }

  const { includeDeps } = await inquirer.prompt<{ includeDeps: boolean }>([
    {
      type: 'confirm',
      name: 'includeDeps',
      message: 'Include referenced plans as dependencies?',
      default: true,
    },
  ]);

  if (exists) {
    await addPlans({
      stackName,
      planIds: selectedPlans,
      autoResolveDependencies: includeDeps,
    });
  } else {
    await createNew({
      stackName,
      planIds: selectedPlans,
      description,
      autoResolveDependencies: includeDeps,
    });
  }
};
