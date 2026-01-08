import { describe, expect, it } from 'vitest';
import { parseMetadataBlock, serializeMetadata } from '../../src/parser/metadata-parser.js';

describe('parseMetadataBlock', () => {
  it('parses simple key:value pairs', () => {
    const result = parseMetadataBlock('Task text [id:1 energy:low]');
    expect(result.metadata).toEqual({ id: '1', energy: 'low' });
    expect(result.textWithoutMetadata).toBe('Task text');
    expect(result.hasMetadata).toBe(true);
  });

  it('parses multiple metadata fields', () => {
    const result = parseMetadataBlock('Do something [id:1 energy:normal est:30m due:2025-12-20]');
    expect(result.metadata).toEqual({
      id: '1',
      energy: 'normal',
      est: '30m',
      due: '2025-12-20',
    });
  });

  it('returns empty metadata when no block present', () => {
    const result = parseMetadataBlock('Task without metadata');
    expect(result.metadata).toEqual({});
    expect(result.textWithoutMetadata).toBe('Task without metadata');
    expect(result.hasMetadata).toBe(false);
  });

  it('handles dotted IDs', () => {
    const result = parseMetadataBlock('Subtask [id:1.1.2]');
    expect(result.metadata.id).toBe('1.1.2');
  });

  it('handles tags with commas', () => {
    const result = parseMetadataBlock('Task [id:1 tags:email,urgent,admin]');
    expect(result.metadata.tags).toBe('email,urgent,admin');
  });
});

describe('serializeMetadata', () => {
  it('serializes metadata to string', () => {
    const result = serializeMetadata({ id: '1', energy: 'low' });
    expect(result).toBe('[id:1 energy:low]');
  });

  it('returns empty string for empty metadata', () => {
    const result = serializeMetadata({});
    expect(result).toBe('');
  });

  it('skips undefined values', () => {
    const result = serializeMetadata({ id: '1', energy: '' });
    expect(result).toBe('[id:1]');
  });
});

describe('parseMetadataBlock edge cases', () => {
  it('handles metadata with priority', () => {
    const result = parseMetadataBlock('Task [id:1 priority:high]');
    expect(result.metadata.priority).toBe('high');
  });

  it('handles metadata with bucket', () => {
    const result = parseMetadataBlock('Task [id:1 bucket:today]');
    expect(result.metadata.bucket).toBe('today');
  });

  it('handles metadata with plan date', () => {
    const result = parseMetadataBlock('Task [id:1 plan:2025-12-10]');
    expect(result.metadata.plan).toBe('2025-12-10');
  });

  it('handles metadata with area', () => {
    const result = parseMetadataBlock('Task [id:1 area:work]');
    expect(result.metadata.area).toBe('work');
  });

  it('handles metadata with created/updated dates', () => {
    const result = parseMetadataBlock('Task [id:1 created:2025-12-01 updated:2025-12-10]');
    expect(result.metadata.created).toBe('2025-12-01');
    expect(result.metadata.updated).toBe('2025-12-10');
  });

  it('handles text with brackets that are not metadata', () => {
    const result = parseMetadataBlock('Task with [brackets] in text [id:1]');
    expect(result.metadata.id).toBe('1');
    expect(result.textWithoutMetadata).toBe('Task with [brackets] in text');
  });

  it('handles empty metadata block', () => {
    const result = parseMetadataBlock('Task []');
    expect(result.metadata).toEqual({});
    expect(result.hasMetadata).toBe(false);
  });

  it('handles whitespace around values', () => {
    const result = parseMetadataBlock('Task [id:1 energy:low]');
    expect(result.metadata.id).toBe('1');
    expect(result.metadata.energy).toBe('low');
  });
});
