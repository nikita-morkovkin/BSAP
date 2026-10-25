import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 }, mutations: { retry: false } },
});

type AppProvidersProps = { children: ReactNode };

const AppProviders = ({ children }: AppProvidersProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster richColors closeButton position="bottom-right" />
    </QueryClientProvider>
  );
};

export default AppProviders;