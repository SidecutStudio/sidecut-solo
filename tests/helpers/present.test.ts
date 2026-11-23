import { describe, expect, test } from 'vitest';
import { safeText, textReport } from '../../plugins/sidecut-solo/server/src/helper/lib/present.ts';

function report() {
  return {
    title: 'Recovery',
    changed: ['Fixed addition'],
    checked: ['Local test passed; CI unknown'],
    remains: ['Current remote checks'],
    end_state: 'Locally verified; not merged',
    links: [{ label: 'Fixture', url: 'javascript:alert(1)' }],
  };
}

describe('report', () => {
  test('redacts credentials and private paths', () => {
    const data = report();
    data.changed.push(
      'C:\\Users\\someone\\secret.txt token=private sk-1234567890abcdef /Users/me/notes.md',
    );
    const text = textReport(data);
    for (const leak of ['sk-123', 'token=private', 'someone', '/Users/me', 'javascript:'])
      expect(text).not.toContain(leak);
    expect(text).toContain('End state: Locally verified; not merged');
    expect(text).toContain('Link: Fixture\n');
  });

  test('fields are strict and links optional', () => {
    const data = report() as Record<string, unknown>;
    (data.links as Record<string, string>[])[0] = {
      label: 'x',
      url: 'https://example.com',
      status: 'greenish',
    };
    expect(() => textReport(data)).toThrow('label and a url');
    delete data.links;
    expect(textReport(data)).not.toContain('Link');
    expect(() => textReport({ ...report(), extra: 1 })).toThrow('nothing else');
    expect(() => textReport({ ...report(), changed: 'one' })).toThrow('list of text');
  });

  for (const url of [
    'https://github.com/SidecutStudio/solo-workflow/pull/21',
    'https://github.com/SidecutStudio/solo-workflow/releases/tag/v0.2.0',
    'https://example.com/C:/public',
  ]) {
    test(`public link survives: ${url}`, () => {
      expect(safeText(url)).toBe(url);
      expect(textReport({ ...report(), links: [{ label: 'Verified result', url }] })).toContain(
        `Link: Verified result ${url}`,
      );
    });
  }

  test('http URL text is not mistaken for a Windows path', () => {
    expect(safeText('http://example.com/results/42')).toBe('http://example.com/results/42');
  });

  for (const path of ['C:\\Users\\someone\\private.txt', 'C:/Users/someone/private.txt']) {
    test(`standalone Windows path stays redacted: ${path}`, () => {
      expect(safeText(path)).toBe('[private path]');
      for (const label of ['Path:', 'file:'])
        expect(safeText(`${label}${path}`)).toBe(`${label}[private path]`);
    });
  }

  for (const url of [
    'https://user:secret@example.com/results',
    'https://user@example.com/results',
    'https://example.com/results?token=private',
    'https://example.com/results#private',
  ]) {
    test(`sensitive link is hidden: ${url}`, () => {
      const text = textReport({ ...report(), links: [{ label: 'Sensitive result', url }] });
      expect(text).not.toContain(url);
      expect(text).toContain('Link: Sensitive result');
    });
  }
});
