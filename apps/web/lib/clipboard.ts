import { notify } from '@/lib/notify';

/** Copies text; a blocked clipboard says so where the reader can see and hear it. Returns whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    notify('Copying was blocked by the browser. Select the text and copy it by hand.');
    return false;
  }
}
