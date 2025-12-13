export type FlagMap = Partial<Record<string, string>>;

export function extractFlags(args: string[], keys: readonly string[]): FlagMap {
  const flags: FlagMap = {};
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    if (token === undefined || !keys.includes(token)) {
      index += 1;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Flag '${token}' requires a value.`);
    }
    flags[token] = value;
    args.splice(index, 2);
  }
  return flags;
}

export function extractBooleanFlags(args: string[], keys: readonly string[]): Set<string> {
  const flags = new Set<string>();
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    if (token === undefined || !keys.includes(token)) {
      index += 1;
      continue;
    }
    flags.add(token);
    args.splice(index, 1);
  }
  return flags;
}

export function extractRepeatableFlags(args: string[], key: string): string[] {
  const values: string[] = [];
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    if (token !== key) {
      index += 1;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Flag '${key}' requires a value.`);
    }
    values.push(value);
    args.splice(index, 2);
  }
  return values;
}

export function extractMultipleFlags(args: string[], keys: readonly string[]): string[] {
  const values: string[] = [];
  let index = 0;
  while (index < args.length) {
    const token = args[index];
    if (token === undefined || !keys.includes(token)) {
      index += 1;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Flag '${token}' requires a value.`);
    }
    values.push(value);
    args.splice(index, 2);
  }
  return values;
}

export function expectValue(flag: string, value: string | undefined): string {
  if (value === undefined) {
    throw new Error(`Flag '${flag}' requires a value.`);
  }
  return value;
}
