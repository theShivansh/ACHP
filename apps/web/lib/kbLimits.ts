// The backend's library upload limits (apps/api/main.py, POST /kb/upload), mirrored so the page says what is wrong
// before sending anything. The server still enforces them.
export const KB_FILE_TYPES = ['.pdf', '.docx', '.doc', '.txt', '.md'] as const;
export const KB_MAX_BYTES = 50 * 1024 * 1024;
export const KB_MIN_TEXT = 10;

export function fileProblem(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!(KB_FILE_TYPES as readonly string[]).includes(ext)) {
    return `“${file.name}” is not a file a library can read. Use a PDF, a Word document (.docx or .doc), or a text file (.txt or .md).`;
  }
  if (file.size > KB_MAX_BYTES) return `“${file.name}” is larger than 50 MB. Split it, or add the part you need as text.`;
  if (file.size === 0) return `“${file.name}” is empty.`;
  return null;
}

export function urlProblem(url: string): string | null {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return 'A web address starts with http:// or https://.';
  try {
    new URL(u);
  } catch {
    return 'That is not a complete web address.';
  }
  return null;
}

export function textProblem(text: string): string | null {
  return text.trim().length < KB_MIN_TEXT ? `Paste at least ${KB_MIN_TEXT} characters of text.` : null;
}
