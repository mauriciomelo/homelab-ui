import { QueryProvider } from '@/lib/query-provider';
import { render } from '@testing-library/react';

export * from '@testing-library/react';
export * from './mocks/node';

export function renderWithProviders(ui: React.ReactElement) {
  return render(ui, {
    wrapper: () => (
      <>
        <QueryProvider>{ui}</QueryProvider>
      </>
    ),
  });
}
