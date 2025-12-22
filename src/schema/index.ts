import { z } from 'zod';

export const EnergySchema = z.enum(['low', 'normal', 'high']);
export type Energy = z.infer<typeof EnergySchema>;

export const PrioritySchema = z.enum(['high', 'normal', 'low']);
export type Priority = z.infer<typeof PrioritySchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  area: z.string().optional(),
  parentArea: z.string().optional(),
  filePath: z.string(),
  lineNumber: z.number(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const AreaHeadingSchema = z.object({
  area: z.string(),
  name: z.string(),
  filePath: z.string(),
  lineNumber: z.number(),
  headingLevel: z.number(),
});
export type AreaHeading = z.infer<typeof AreaHeadingSchema>;

export const SectionHeadingSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  filePath: z.string(),
  lineNumber: z.number(),
  headingLevel: z.number(),
  parentId: z.string().nullable(),
});
export type SectionHeading = z.infer<typeof SectionHeadingSchema>;

export const TaskSchema = z.object({
  globalId: z.string(),
  localId: z.string(),
  projectId: z.string(),
  text: z.string(),
  completed: z.boolean(),

  // Metadata
  energy: EnergySchema.optional(),
  priority: PrioritySchema.optional(),
  est: z.string().optional(),
  due: z.string().optional(),
  plan: z.string().optional(),
  bucket: z.string().optional(),
  area: z.string().optional(),
  tags: z.array(z.string()).optional(),
  created: z.string().optional(),
  updated: z.string().optional(),

  // Location
  filePath: z.string(),
  lineNumber: z.number(),
  indentLevel: z.number(),

  // Hierarchy
  parentId: z.string().nullable(),
  childrenIds: z.array(z.string()),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskIndexSchema = z.object({
  version: z.literal(3),
  generatedAt: z.string(),
  files: z.array(z.string()),

  areas: z.record(z.string(), AreaHeadingSchema),
  projects: z.record(z.string(), ProjectSchema),
  sections: z.record(z.string(), SectionHeadingSchema),
  tasks: z.record(z.string(), TaskSchema),
});
export type TaskIndex = z.infer<typeof TaskIndexSchema>;
