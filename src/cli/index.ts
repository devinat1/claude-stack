import { Command } from 'commander';
import {
  initCommand,
  lsCommand,
  createCommand,
  statusCommand,
  runCommand,
} from './commands/index.js';

const program = new Command();

program
  .name('cc')
  .description('Claude Stack - Graphite-like plan stack manager for Claude Code')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize Claude Stack configuration')
  .action(async () => {
    await initCommand();
  });

program
  .command('ls [stack]')
  .description('List stacks or visualize a specific stack as a tree')
  .action(async (stackName?: string) => {
    await lsCommand({ stackName });
  });

program
  .command('create <name>')
  .description('Create a new stack or add plans to an existing stack')
  .option('-p, --plans <plans...>', 'Plan IDs to include')
  .option('--from-plan <planId>', 'Create stack from a plan and all its references')
  .option('-d, --description <desc>', 'Stack description')
  .option('-i, --interactive', 'Interactive plan selection')
  .option('--no-deps', 'Do not auto-resolve dependencies')
  .action(async (stackName: string, options) => {
    await createCommand({ stackName, options });
  });

program
  .command('status [stack]')
  .description('Show execution status of stacks')
  .action(async (stackName?: string) => {
    await statusCommand({ stackName });
  });

program
  .command('run <stack>')
  .description('Execute plans in a stack in dependency order')
  .option('--dry-run', 'Show execution order without running')
  .option('--from <planId>', 'Start execution from a specific plan')
  .option('--reset', 'Reset all plan statuses before running')
  .option('--claude <command>', 'Claude CLI command to use (default: claude)')
  .action(async (stackName: string, options) => {
    await runCommand({ stackName, options });
  });

export const run = (): void => {
  program.parse();
};

export { program };
