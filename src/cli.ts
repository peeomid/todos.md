#!/usr/bin/env node
import { printHelp, printVersion } from './cli/help.js';
import { handleIndexCommand, printIndexHelp } from './cli/index-command.js';
import { handleLintCommand, printLintHelp } from './cli/lint-command.js';
import { handleEnrichCommand, printEnrichHelp } from './cli/enrich-command.js';
import { handleListCommand, printListHelp } from './cli/list-command.js';
import { handleShowCommand, printShowHelp } from './cli/show-command.js';
import { handleDoneCommand, printDoneHelp } from './cli/done-command.js';
import { handleUndoneCommand, printUndoneHelp } from './cli/undone-command.js';
import { handleAddCommand, printAddHelp } from './cli/add-command.js';
import { handleEditCommand, printEditHelp } from './cli/edit-command.js';
import { handleSearchCommand, printSearchHelp } from './cli/search-command.js';
import { handleStatsCommand, printStatsHelp } from './cli/stats-command.js';
import { handleSyncCommand, printSyncHelp } from './cli/sync-command.js';
import { handleBlockTemplateCommand, printBlockTemplateHelp } from './cli/block-template-command.js';
import { CliUsageError } from './cli/errors.js';
import { extractBooleanFlags } from './cli/flag-utils.js';

const VERSION = '0.1.0';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(1);
    return;
  }

  // Check for global help/version flags ONLY if they appear before any command
  // (i.e., at position 0) or if no command is present
  const firstArg = args[0];
  if (firstArg === '--help' || firstArg === '-h') {
    printHelp();
    return;
  }
  if (firstArg === '--version' || firstArg === '-v') {
    printVersion(VERSION);
    return;
  }

  const command = args.shift();

  if (!command) {
    printHelp();
    process.exit(1);
    return;
  }

  // Check for command-specific help
  const helpFlags = extractBooleanFlags(args, ['--help', '-h']);
  const showHelp = helpFlags.has('--help') || helpFlags.has('-h');

  try {
    switch (command) {
      case 'help':
        printHelp();
        break;

      case 'lint':
        if (showHelp) {
          printLintHelp();
        } else {
          handleLintCommand(args);
        }
        break;

      case 'index':
        if (showHelp) {
          printIndexHelp();
        } else {
          handleIndexCommand(args);
        }
        break;

      case 'enrich':
        if (showHelp) {
          printEnrichHelp();
        } else {
          handleEnrichCommand(args);
        }
        break;

      case 'list':
        if (showHelp) {
          printListHelp();
        } else {
          handleListCommand(args);
        }
        break;

      case 'show':
        if (showHelp) {
          printShowHelp();
        } else {
          handleShowCommand(args);
        }
        break;

      case 'done':
        if (showHelp) {
          printDoneHelp();
        } else {
          handleDoneCommand(args);
        }
        break;

      case 'undone':
        if (showHelp) {
          printUndoneHelp();
        } else {
          handleUndoneCommand(args);
        }
        break;

      case 'add':
        if (showHelp) {
          printAddHelp();
        } else {
          handleAddCommand(args);
        }
        break;

      case 'edit':
        if (showHelp) {
          printEditHelp();
        } else {
          handleEditCommand(args);
        }
        break;

      case 'search':
        if (showHelp) {
          printSearchHelp();
        } else {
          handleSearchCommand(args);
        }
        break;

      case 'stats':
        if (showHelp) {
          printStatsHelp();
        } else {
          handleStatsCommand(args);
        }
        break;

      case 'sync':
        if (showHelp) {
          printSyncHelp();
        } else {
          handleSyncCommand(args);
        }
        break;

      case 'block-template':
        if (showHelp) {
          printBlockTemplateHelp();
        } else {
          handleBlockTemplateCommand(args);
        }
        break;

      case 'config': {
        console.error(`Command '${command}' is not yet implemented.`);
        process.exit(1);
        break;
      }

      default:
        printHelp(`Unknown command '${command}'.`);
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(error.message);
      process.exit(1);
      return;
    }
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
