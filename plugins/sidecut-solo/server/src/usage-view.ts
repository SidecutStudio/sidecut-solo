// The usage dashboard's view script inside an MCP App host (Codex desktop, Claude, ChatGPT): it waits
// for get_usage's result and hands the summary to the dashboard's own render() and showRange().
import { App } from '@modelcontextprotocol/ext-apps';

declare function render(summary: unknown): void;
declare function showRange(summary: unknown): void;

const app = new App({ name: 'Solo usage', version: '1.0.0' });
app.ontoolresult = (result) => {
  const summary = (result.structuredContent as { summary?: unknown } | undefined)?.summary;
  if (summary) {
    render(summary);
    showRange(summary);
  }
};
await app.connect();
