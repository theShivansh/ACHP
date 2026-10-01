import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { mockBackend } from './site-mocks';

// /developers (07 §9): the MCP server is real and runs where the reader runs it; the page lists exactly what the
// server reports (lib/mcp.generated.json, from the server's own discovery), and says plainly it is not hosted here.

const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '..', 'lib', 'mcp.generated.json'), 'utf8')) as {
  tools: { name: string; read_only: boolean }[];
  resources: { uri: string }[];
  prompts: { name: string }[];
};

test('the MCP tab opens first, says how to run it, and lists the tools the server reports', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/developers');
  await expect(page.getByRole('tab', { name: 'MCP' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-mcp-status]')).toContainText('Available to run yourself.');
  await expect(page.locator('[data-mcp-status]')).toContainText('This deployment does not host it.');
  for (const title of ['Install it', 'Add it to Claude Code', 'Add it to Claude Desktop or another host', 'Run it as a web service']) {
    await expect(page.locator(`[data-mcp-setup="${title}"]`)).toBeVisible();
  }
  await expect(page.locator('[data-mcp-tool]')).toHaveCount(manifest.tools.length);
  for (const t of manifest.tools) {
    await expect(page.locator(`[data-mcp-tool="${t.name}"]`)).toContainText(t.read_only ? 'Reads only' : 'Starts a check');
  }
  for (const r of manifest.resources) await expect(page.locator(`[data-mcp-resource="${r.uri}"]`)).toBeVisible();
  for (const p of manifest.prompts) await expect(page.locator(`[data-mcp-prompt="${p.name}"]`)).toBeVisible();
  // No secret in any snippet.
  expect(await page.locator('main pre').allTextContents()).not.toContainEqual(expect.stringMatching(/GROQ|API_KEY|token/i));
});

test('the REST and Events tabs are still one click away', async ({ page }) => {
  await mockBackend(page, { libraries: [] });
  await page.goto('/developers');
  await page.getByRole('tab', { name: 'REST' }).click();
  await expect(page.locator('[data-rest="Start a check"]')).toBeVisible();
  await page.getByRole('tab', { name: 'Events' }).click();
  await expect(page.locator('[data-event-table]')).toBeVisible();
});
