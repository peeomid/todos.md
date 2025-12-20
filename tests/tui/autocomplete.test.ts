import { describe, expect, it } from 'vitest';
import {
  applySuggestion,
  generateSuggestions,
  getAutocompleteContext,
} from '../../src/tui/autocomplete.js';

describe('tui autocomplete', () => {
  it('suggests bucket: for partial key input', () => {
    const input = 'b';
    const ctx = getAutocompleteContext(input, input.length);
    const suggestions = generateSuggestions(ctx, []);
    const bucket = suggestions.find((s) => s.type === 'key' && s.text === 'bucket:');
    expect(bucket).toBeTruthy();
  });

  it('applying a key suggestion keeps cursor after colon (no trailing space)', () => {
    const input = 'b';
    const ctx = getAutocompleteContext(input, input.length);
    const suggestions = generateSuggestions(ctx, []);
    const bucket = suggestions.find((s) => s.type === 'key' && s.text === 'bucket:');
    expect(bucket).toBeTruthy();

    const { newInput, newCursorPos } = applySuggestion(input, input.length, bucket!, ctx);
    expect(newInput).toBe('bucket:');
    expect(newCursorPos).toBe('bucket:'.length);

    const nextCtx = getAutocompleteContext(newInput, newCursorPos);
    expect(nextCtx.filterKey).toBe('bucket');
    expect(nextCtx.isAfterColon).toBe(true);

    const valueSuggestions = generateSuggestions(nextCtx, []);
    expect(valueSuggestions.map((s) => s.text)).toEqual(
      expect.arrayContaining(['today', 'upcoming', 'anytime', 'someday'])
    );
  });

  it('applying a value suggestion adds a trailing space', () => {
    const input = 'bucket:t';
    const ctx = getAutocompleteContext(input, input.length);
    const suggestions = generateSuggestions(ctx, []);
    const today = suggestions.find((s) => s.type === 'value' && s.text === 'today');
    expect(today).toBeTruthy();

    const { newInput, newCursorPos } = applySuggestion(input, input.length, today!, ctx);
    expect(newInput).toBe('bucket:today ');
    expect(newCursorPos).toBe(newInput.length);
  });
});

