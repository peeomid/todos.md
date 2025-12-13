import { z } from 'zod';

export const EnergySchema = z.enum(['low', 'normal', 'high']);
export type Energy = z.infer<typeof EnergySchema>;

export const PrioritySchema = z.enum(['high', 'normal', 'low']);
export type Priority = z.infer<typeof PrioritySchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  area: z.string().optional(),
  filePath: z.string(),
  lineNumber: z.number(),
});
export type Project = z.infer<typeof ProjectSchema>;

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
  version: z.literal(1),
  generatedAt: z.string(),
  files: z.array(z.string()),

  projects: z.record(z.string(), ProjectSchema),
  tasks: z.record(z.string(), TaskSchema),
});
export type TaskIndex = z.infer<typeof TaskIndexSchema>;
