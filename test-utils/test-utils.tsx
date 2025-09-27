import { TRPCReactProvider } from '@/trpc/client';
import { render } from '@testing-library/react';

export * from '@testing-library/react';
export * from './mocks/node';

export function renderWithProviders(ui: React.ReactElement) {
  return render(ui, {
    wrapper: () => (
      <>
        <TRPCReactProvider>{ui}</TRPCReactProvider>
      </>
    ),
  });
}
