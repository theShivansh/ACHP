import { IBM_Plex_Mono, Kalam, Newsreader, Public_Sans } from 'next/font/google';

// 04 §4. Newsreader and Public Sans are preloaded; Kalam (margin notes) and
// IBM Plex Mono (code and raw JSON only) load on demand.
export const newsreader = Newsreader({
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-newsreader',
});

export const publicSans = Public_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-public-sans',
});

export const kalam = Kalam({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-kalam',
});

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  preload: false,
  variable: '--font-plex-mono',
});

export const fontVariables = [newsreader, publicSans, kalam, plexMono].map((f) => f.variable).join(' ');
