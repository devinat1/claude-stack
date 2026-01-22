import chalk from 'chalk';
import { ensureConfigDir, saveConfig, loadConfig, getConfigDir, isInitialized } from '../../storage/index.js';
import { getPlansDirectory } from '../../core/plan-parser.js';

export const initCommand = async (): Promise<void> => {
  const alreadyInitialized = await isInitialized();

  if (alreadyInitialized) {
    console.log(chalk.yellow('Claude Stack is already initialized.'));
    console.log(`Config directory: ${chalk.cyan(getConfigDir())}`);
    return;
  }

  await ensureConfigDir();

  const config = await loadConfig();
  config.plansDirectory = getPlansDirectory();
  await saveConfig({ config });

  console.log(chalk.green('✓ Claude Stack initialized successfully.'));
  console.log();
  console.log(`Config directory: ${chalk.cyan(getConfigDir())}`);
  console.log(`Plans directory: ${chalk.cyan(config.plansDirectory)}`);
  console.log();
  console.log('Next steps:');
  console.log(`  ${chalk.cyan('cc create <stack-name> -p <plan-id>')} - Create a new stack`);
  console.log(`  ${chalk.cyan('cc ls')} - List all stacks`);
};
