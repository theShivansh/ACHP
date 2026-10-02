'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { ThemeProvider } from 'next-themes';
import { useEffect, useState } from 'react';
import { isLowFx } from '@/lib/lowfx';

// Development only: never part of a production bundle.
const ReactQueryDevtools = dynamic(() => import('@tanstack/react-query-devtools').then((m) => m.ReactQueryDevtools), { ssr: false });

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // 05 §3.2: no line boil on a low-end device.
  useEffect(() => {
    if (isLowFx(navigator)) document.documentElement.setAttribute('data-lowfx', '');
  }, []);

  return (
    // The dark theme is keyed on [data-theme] (04 §3.2); "system" follows prefers-color-scheme.
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
