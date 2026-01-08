/**
 * Date utilities for parsing date filter values like "today", "tomorrow", "this-week"
 */

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Get start of day (00:00:00)
 */
function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of day (23:59:59.999)
 */
function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get start of week (Monday)
 */
function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  // Convert Sunday (0) to 7 for easier calculation
  const diff = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - diff);
  return startOfDay(result);
}

/**
 * Get end of week (Sunday)
 */
function endOfWeek(date: Date): Date {
  const result = startOfWeek(date);
  result.setDate(result.getDate() + 6);
  return endOfDay(result);
}

/**
 * Parse a date string in YYYY-MM-DD format
 */
export function parseDate(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // Validate the date is real (e.g., not Feb 30)
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return null;
  }
  return date;
}

/**
 * Format a Date to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a relative date string ('today', 'tomorrow') and return YYYY-MM-DD format.
 * Returns the input unchanged if it's already in YYYY-MM-DD format.
 */
export function parseRelativeDate(spec: string): string {
  const now = new Date();
  const today = startOfDay(now);

  const relativeMatch = spec.match(/^\+(\d+)([dw])$/i);
  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    const unit = relativeMatch[2]?.toLowerCase();
    const result = new Date(today);
    result.setDate(result.getDate() + (unit === 'w' ? amount * 7 : amount));
    return formatDate(result);
  }

  switch (spec.toLowerCase()) {
    case 'today':
      return formatDate(today);

    case 'tomorrow': {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return formatDate(tomorrow);
    }

    default:
      return spec;
  }
}

/**
 * Parse a date spec into a DateRange
 * Supported formats:
 * - "today" - current day
 * - "tomorrow" - next day
 * - "this-week" - Monday to Sunday of current week
 * - "next-week" - Monday to Sunday of next week
 * - "YYYY-MM-DD" - exact date
 * - "YYYY-MM-DD:YYYY-MM-DD" - date range
 */
export function parseDateSpec(spec: string): DateRange | null {
  const now = new Date();
  const today = startOfDay(now);

  switch (spec.toLowerCase()) {
    case 'today': {
      return { start: today, end: endOfDay(today) };
    }

    case 'tomorrow': {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { start: tomorrow, end: endOfDay(tomorrow) };
    }

    case 'this-week': {
      return { start: startOfWeek(today), end: endOfWeek(today) };
    }

    case 'next-week': {
      const nextWeekStart = new Date(startOfWeek(today));
      nextWeekStart.setDate(nextWeekStart.getDate() + 7);
      const nextWeekEnd = new Date(nextWeekStart);
      nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
      return { start: nextWeekStart, end: endOfDay(nextWeekEnd) };
    }

    default: {
      // Check for date range format: YYYY-MM-DD:YYYY-MM-DD
      if (spec.includes(':')) {
        const [startStr, endStr] = spec.split(':');
        if (!startStr || !endStr) {
          return null;
        }
        const startDate = parseDate(startStr);
        const endDate = parseDate(endStr);
        if (!startDate || !endDate) {
          return null;
        }
        return { start: startOfDay(startDate), end: endOfDay(endDate) };
      }

      // Try exact date
      const date = parseDate(spec);
      if (date) {
        return { start: startOfDay(date), end: endOfDay(date) };
      }

      return null;
    }
  }
}

/**
 * Check if a date string (YYYY-MM-DD) is within a date range
 */
export function isDateInRange(dateStr: string, range: DateRange): boolean {
  const date = parseDate(dateStr);
  if (!date) {
    return false;
  }
  return date >= range.start && date <= range.end;
}

/**
 * Check if a date string (YYYY-MM-DD) is before today
 */
export function isOverdue(dateStr: string): boolean {
  const date = parseDate(dateStr);
  if (!date) {
    return false;
  }
  const today = startOfDay(new Date());
  return date < today;
}
