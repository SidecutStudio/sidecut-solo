// A concise, shareable text report from actual results. Reports leave out credentials and
// private paths, and only show links that are safe to share.
import { WorkflowError } from './git.ts';

type Report = {
  title: string;
  changed: string[];
  checked: string[];
  remains: string[];
  end_state: string;
  links?: { label: string; url: string }[];
};

export function safeText(value: string): string {
  return value
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]+)\b/g, '[redacted]')
    .replace(/\b(?:Bearer\s+\S+|(?:api[_-]?key|token|password)\s*[:=]\s*\S+)/gi, '[redacted]')
    .replace(
      /(?<![\w/\\])[A-Za-z]:[\\/][^\s<>"']+|\/(?:Users|home|tmp)\/[^\s<>"']+/g,
      '[private path]',
    );
}

function validate(data: unknown): Report {
  const required = ['title', 'changed', 'checked', 'remains', 'end_state'];
  const keys = Object.keys((data ?? {}) as object);
  if (
    !required.every((key) => keys.includes(key)) ||
    keys.some((key) => !required.includes(key) && key !== 'links')
  ) {
    throw new WorkflowError(
      `Report needs ${[...required].sort().join(', ')} and may add links; nothing else`,
    );
  }
  const report = data as Report;
  for (const name of ['title', 'end_state'] as const) {
    if (typeof report[name] !== 'string' || !report[name].trim()) {
      throw new WorkflowError(`Report ${name} must be nonempty text`);
    }
  }
  for (const name of ['changed', 'checked', 'remains'] as const) {
    if (!Array.isArray(report[name]) || !report[name].every((item) => typeof item === 'string')) {
      throw new WorkflowError(`Report ${name} must be a list of text`);
    }
  }
  const links = report.links ?? [];
  if (
    !Array.isArray(links) ||
    !links.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        Object.keys(item).sort().join() === 'label,url' &&
        typeof item.label === 'string' &&
        typeof item.url === 'string',
    )
  ) {
    throw new WorkflowError('Each link needs exactly a label and a url, as text');
  }
  return report;
}

/** Malformed URLs, credentials, queries and fragments stay private. */
function publicUrl(url: string): boolean {
  try {
    const parts = new URL(url);
    return (
      parts.protocol === 'https:' &&
      Boolean(parts.hostname) &&
      !parts.username &&
      !parts.password &&
      !parts.search &&
      !url.includes('?') &&
      !url.includes('#') &&
      ![...url].some((char) => /\s/.test(char) || char.charCodeAt(0) < 32) &&
      safeText(url) === url
    );
  } catch {
    return false;
  }
}

export function textReport(data: unknown): string {
  const report = validate(data);
  const lines = [safeText(report.title), ''];
  for (const [label, field] of [
    ['Changed', 'changed'],
    ['Checked', 'checked'],
    ['Remains', 'remains'],
  ] as const) {
    lines.push(`${label}: ${report[field].map(safeText).join('; ') || 'None recorded'}`);
  }
  lines.push(`End state: ${safeText(report.end_state)}`);
  for (const link of report.links ?? []) {
    lines.push(safeText(`Link: ${link.label}${publicUrl(link.url) ? ` ${link.url}` : ''}`));
  }
  return `${lines.join('\n')}\n`;
}
