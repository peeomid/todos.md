import type { LintRule } from '../types.js';
import { duplicateIdRule } from './duplicate-id.js';
import { duplicateTagsRule } from './duplicate-tags.js';
import { emptyProjectRule } from './empty-project.js';
import { inconsistentSubtaskIndentRule } from './inconsistent-subtask-indent.js';
import { invalidDateFormatRule } from './invalid-date-format.js';
import { invalidEnergyValueRule } from './invalid-energy-value.js';
import { invalidEstimateFormatRule } from './invalid-estimate-format.js';
import { malformedMetadataRule } from './malformed-metadata.js';
import { missingIdRule } from './missing-id.js';
import { orphanSubtaskRule } from './orphan-subtask.js';
import { projectHeadingWithoutIdRule } from './project-heading-without-id.js';
import { taskOutsideProjectRule } from './task-outside-project.js';

export const allRules: LintRule[] = [
  // Errors
  duplicateIdRule,
  invalidDateFormatRule,
  invalidEnergyValueRule,
  invalidEstimateFormatRule,
  malformedMetadataRule,
  projectHeadingWithoutIdRule,

  // Warnings
  orphanSubtaskRule,
  missingIdRule,
  taskOutsideProjectRule,
  inconsistentSubtaskIndentRule,
  emptyProjectRule,

  // Info
  duplicateTagsRule,
];

export {
  duplicateIdRule,
  invalidDateFormatRule,
  invalidEnergyValueRule,
  invalidEstimateFormatRule,
  malformedMetadataRule,
  projectHeadingWithoutIdRule,
  orphanSubtaskRule,
  missingIdRule,
  taskOutsideProjectRule,
  inconsistentSubtaskIndentRule,
  emptyProjectRule,
  duplicateTagsRule,
};
