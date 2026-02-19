import '../app/globals.css';
import { describe, expect, vi, beforeEach } from 'vitest';
import { userEvent, renderWithProviders, test } from '@/test-utils/browser';
import { page } from 'vitest/browser';
import { useState } from 'react';
import { ResourceField } from './resource-field';
import { cpuConfig, memoryConfig, storageConfig } from '@/lib/resource-utils';

describe('ResourceField', () => {
  beforeEach(() => {
    page.viewport(414, 896);
  });

  test('render slider labels for the memory field', async () => {
    const user = userEvent.setup();
    await renderWithProviders(
      <StatefulResourceField
        id="memory"
        label="Memory"
        value="1Gi"
        config={memoryConfig}
      />,
    );

    const input = page.getByRole('textbox', { name: 'Memory' });
    // open slider popover
    await user.click(input);

    // Popover is open
    expect(page.getByText('Quick adjust')).toBeInTheDocument();

    await expect(page.getByLabelText('current-value')).toHaveTextContent('1Gi');
    await expect(page.getByLabelText('min-value')).toHaveTextContent('0');
    await expect(page.getByLabelText('max-value')).toHaveTextContent('32Gi');
  });

  test('render slider labels for the cpu field', async () => {
    const user = userEvent.setup();
    await renderWithProviders(
      <StatefulResourceField
        id="cpu"
        label="CPU"
        value="1"
        config={cpuConfig}
      />,
    );

    const input = page.getByRole('textbox', { name: 'CPU' });
    // open slider popover
    await user.click(input);

    // Popover is open
    expect(page.getByText('Quick adjust')).toBeInTheDocument();

    await expect(page.getByLabelText('current-value')).toHaveTextContent(
      '1 cores',
    );
    await expect(page.getByLabelText('min-value')).toHaveTextContent('0');
    await expect(page.getByLabelText('max-value')).toHaveTextContent('8 cores');
  });

  describe('memory config', () => {
    test('renders input and unit', async () => {
      await renderWithProviders(
        <StatefulResourceField
          id="cpu"
          label="CPU"
          value="500m"
          config={cpuConfig}
        />,
      );

      const input = page.getByRole('textbox', { name: 'CPU' });
      expect(input).toBeInTheDocument();

      await expect.element(input).toHaveValue('500');
      expect(page.getByText('m')).toBeInTheDocument();
    });

    test('changing unit calls onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();

      await renderWithProviders(
        <StatefulResourceField
          id="memory"
          label="Memory"
          value="1Gi"
          onChange={onChange}
          config={memoryConfig}
        />,
      );

      // open the select by clicking the displayed unit
      await user.click(page.getByText('Gi'));

      // pick a different unit
      await user.click(page.getByRole('option', { name: 'Mi' }));
      // onChange should have been called with a single combined value+unit
      await expect
        .poll(() => vi.mocked(onChange).mock.calls.length)
        .toBeGreaterThan(0);
      expect(vi.mocked(onChange).mock.calls[0][0]).toBe('1Mi');
      await expect(page.getByRole('combobox').last()).toHaveTextContent('Mi');
    });

    test('focus opens quick adjust popover', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();

      await renderWithProviders(
        <StatefulResourceField
          id="memory"
          label="Memory"
          value="2Mi"
          onChange={onChange}
          config={memoryConfig}
        />,
      );

      const input = page.getByRole('textbox', { name: 'Memory' });
      await user.click(input);

      // Popover contains quick adjust text and current value/unit
      expect(page.getByText('Quick adjust')).toBeInTheDocument();
      await expect.element(input).toHaveValue('2');
      await expect(page.getByRole('combobox').last()).toHaveTextContent('Mi');
    });

    test('dragging slider to end sets value to 32 Gi', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();

      await renderWithProviders(
        <StatefulResourceField
          id="memory"
          label="Memory"
          value="0Mi"
          onChange={onChange}
          config={memoryConfig}
        />,
      );

      const input = page.getByRole('textbox', { name: 'Memory' });
      // open popover
      await user.click(input);

      // Focus the slider thumb and send ArrowRight key presses to move it to the end
      const thumb = page.getByRole('slider');
      await user.click(thumb);

      // Move the thumb to the end of the slider (End key ensures max value)
      await user.keyboard('{End}');
      // expect value to be 32 Gi (onChange should have been called)
      await expect
        .poll(() => vi.mocked(onChange).mock.calls.length)
        .toBeGreaterThan(0);
      expect(vi.mocked(onChange).mock.calls[0][0]).toBe('32Gi');

      // popover should display the updated value/unit
      await expect.element(input).toHaveValue('32');
      await expect(
        page.getByRole('combobox', { name: 'memory unit' }),
      ).toHaveTextContent('Gi');
    });

    test('displays error message when error prop is provided', async () => {
      await renderWithProviders(
        <StatefulResourceField
          id="memory"
          label="Memory"
          value="1Gi"
          error="Memory limit is too high"
          config={memoryConfig}
        />,
      );

      const input = page.getByRole('textbox', { name: 'Memory' });
      expect(input).toBeInTheDocument();

      expect(page.getByText('Memory limit is too high')).toBeInTheDocument();
    });
  });

  test('uses custom unit label from config', async () => {
    await renderWithProviders(
      <StatefulResourceField
        id="storage"
        label="Storage"
        value="1Gi"
        config={storageConfig}
      />,
    );

    await expect(
      page.getByRole('combobox', { name: 'storage unit' }),
    ).toHaveTextContent('Gi');
  });
  describe('cpu config', () => {
    test('renders input and unit', async () => {
      await renderWithProviders(
        <StatefulResourceField
          id="cpu"
          label="CPU"
          value="500m"
          config={cpuConfig}
        />,
      );

      const input = page.getByRole('textbox', { name: 'CPU' });
      expect(input).toBeInTheDocument();

      await expect.element(input).toHaveValue('500');
      expect(page.getByText('m')).toBeInTheDocument();
    });

    test('changing unit calls onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();

      await renderWithProviders(
        <StatefulResourceField
          id="cpu"
          label="CPU"
          value="1"
          onChange={onChange}
          config={cpuConfig}
        />,
      );

      // open the select by clicking the displayed unit
      await user.click(page.getByText('cores'));

      // pick a different unit
      await user.click(page.getByRole('option', { name: 'm' }));
      // onChange should have been called with a single combined value+unit
      await expect
        .poll(() => vi.mocked(onChange).mock.calls.length)
        .toBeGreaterThan(0);
      expect(vi.mocked(onChange).mock.calls[0][0]).toBe('1m');
      await expect(
        page.getByRole('combobox', { name: 'cpu unit' }),
      ).toHaveTextContent('m');
    });

    test('dragging slider to end sets value to 8', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();

      await renderWithProviders(
        <StatefulResourceField
          id="cpu"
          label="CPU"
          value="0"
          onChange={onChange}
          config={cpuConfig}
        />,
      );

      const input = page.getByRole('textbox', { name: 'CPU' });
      // open popover
      await user.click(input);

      // Focus the slider thumb and send ArrowRight key presses to move it to the end
      const thumb = page.getByRole('slider');
      await user.click(thumb);

      // Move the thumb to the end of the slider (End key ensures max value)
      await user.keyboard('{End}');
      // expect value to be 8 (onChange should have been called)
      await expect
        .poll(() => vi.mocked(onChange).mock.calls.length)
        .toBeGreaterThan(0);
      expect(vi.mocked(onChange).mock.calls[0][0]).toBe('8');

      // popover should display the updated value/unit
      await expect.element(input).toHaveValue('8');
      await expect(
        page.getByRole('combobox', { name: 'cpu unit' }),
      ).toHaveTextContent('cores');
    });
  });
});

function StatefulResourceField(
  props: React.ComponentProps<typeof ResourceField>,
) {
  const [value, setValue] = useState(props.value);
  return (
    <ResourceField
      {...props}
      value={value}
      onChange={(newValue) => {
        setValue(newValue);
        props.onChange?.(newValue);
      }}
    />
  );
}
