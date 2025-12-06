import { expect, test, vi, describe } from 'vitest';
import { render } from 'vitest-browser-react';
import { ApplicationForm } from './application-form';
import { TRPCReactProvider } from '@/trpc/client';
import '../../globals.css';
import * as actions from './actions';

vi.mock('./actions', () => {
  return {
    updateApp: vi.fn(),
  };
});

export function renderWithProviders(ui: React.ReactElement) {
  return render(ui, {
    wrapper: () => (
      <>
        <TRPCReactProvider>{ui}</TRPCReactProvider>
      </>
    ),
  });
}
describe('ApplicationForm', () => {
  describe('update application', () => {
    test('populates form fields with initial data', async () => {
      const { getByPlaceholder } = await renderWithProviders(
        <ApplicationForm
          data={{
            name: 'my-app',
            image: 'postgres:16',
            envVariables: [{ name: 'DB_NAME', value: 'production' }],
          }}
        />,
      );

      const nameInput = getByPlaceholder('App Name');
      const imageInput = getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      const envNameInput = getByPlaceholder('VARIABLE_NAME');
      const envValueInput = getByPlaceholder('value');

      await expect.element(nameInput).toHaveValue('my-app');
      await expect.element(imageInput).toHaveValue('postgres:16');
      await expect.element(envNameInput).toHaveValue('DB_NAME');
      await expect.element(envValueInput).toHaveValue('production');
    });

    test('adds new environment variable', async () => {
      const screen = await renderWithProviders(
        <ApplicationForm
          data={{
            name: 'test-app',
            image: 'nginx:latest',
            envVariables: [{ name: 'VAR1', value: 'value1' }],
          }}
        />,
      );

      const addButton = screen.getByText('Add Environment Variable');
      await addButton.click();

      await expect
        .poll(() => screen.getByPlaceholder('VARIABLE_NAME').elements().length)
        .toBe(2);
    });

    test('handles successful update', async () => {
      vi.mocked(actions.updateApp).mockResolvedValue({ success: true });

      const { getByPlaceholder, getByText } = await renderWithProviders(
        <ApplicationForm
          data={{
            name: 'test-app',
            image: 'nginx:latest',
            envVariables: [{ name: 'OLD_VAR', value: 'old_value' }],
          }}
        />,
      );

      const imageInput = getByPlaceholder(
        'nginx:latest or registry.example.com/my-app:v1.0.0',
      );
      const nameInput = getByPlaceholder('VARIABLE_NAME');
      const valueInput = getByPlaceholder('value');

      await imageInput.fill('redis:7-alpine');
      await nameInput.fill('NEW_VAR');
      await valueInput.fill('new_value');

      await expect.element(imageInput).toHaveValue('redis:7-alpine');
      await expect.element(nameInput).toHaveValue('NEW_VAR');
      await expect.element(valueInput).toHaveValue('new_value');

      const submitButton = getByText('Update');
      await submitButton.click();

      await expect
        .poll(() => vi.mocked(actions.updateApp))
        .toHaveBeenCalledWith({
          name: 'test-app',
          image: 'redis:7-alpine',
          envVariables: [{ name: 'NEW_VAR', value: 'new_value' }],
        });
    });

    test('app name field is readonly', async () => {
      const { getByPlaceholder } = await renderWithProviders(
        <ApplicationForm
          data={{
            name: 'locked-app',
            image: 'nginx:latest',
            envVariables: [{ name: 'VAR', value: 'val' }],
          }}
        />,
      );

      const nameInput = getByPlaceholder('App Name');
      await expect.element(nameInput).toHaveAttribute('readonly');
    });

    test('renders multiple environment variables correctly', async () => {
      const { getByPlaceholder } = await renderWithProviders(
        <ApplicationForm
          data={{
            name: 'test-app',
            image: 'nginx:latest',
            envVariables: [
              { name: 'VAR1', value: 'value1' },
              { name: 'VAR2', value: 'value2' },
              { name: 'VAR3', value: 'value3' },
            ],
          }}
        />,
      );

      const nameInputs = getByPlaceholder('VARIABLE_NAME').elements();
      const valueInputs = getByPlaceholder('value').elements();

      await expect.poll(() => nameInputs.length).toBe(3);
      await expect.poll(() => valueInputs.length).toBe(3);

      await expect.element(nameInputs[0]).toHaveValue('VAR1');
      await expect.element(valueInputs[0]).toHaveValue('value1');
      await expect.element(nameInputs[1]).toHaveValue('VAR2');
      await expect.element(valueInputs[1]).toHaveValue('value2');
      await expect.element(nameInputs[2]).toHaveValue('VAR3');
      await expect.element(valueInputs[2]).toHaveValue('value3');
    });
  });
});
