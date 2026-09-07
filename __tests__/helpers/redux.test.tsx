import React from 'react';
import {Text} from 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {SecureStorageGate} from '../../helpers/SecureStorageGate';

const renderGate = (initialize: () => void | Promise<void>) =>
  render(
    <SecureStorageGate initialize={initialize} locale="en_US">
      <Text>App content</Text>
    </SecureStorageGate>,
  );

describe('SecureStorageGate', () => {
  it('opens app content only after secure hydration succeeds', async () => {
    const initialize = jest.fn().mockResolvedValue(undefined);
    const view = renderGate(initialize);

    expect(view.queryByText('App content')).toBeNull();

    await waitFor(() => expect(view.getByText('App content')).toBeTruthy());
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('keeps app content closed and hides the failure details', async () => {
    const initialize = jest.fn().mockRejectedValue(new Error('******'));
    const view = renderGate(initialize);

    await waitFor(() =>
      expect(view.getByText('Secure storage unavailable')).toBeTruthy(),
    );
    expect(view.queryByText('App content')).toBeNull();
    expect(view.queryByText('******')).toBeNull();
    expect(view.getByTestId('secure-storage-retry')).toBeTruthy();
  });

  it('retries failed initialization and opens content after recovery', async () => {
    const initialize = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);
    const view = renderGate(initialize);

    const retry = await waitFor(() => view.getByTestId('secure-storage-retry'));
    fireEvent.press(retry);

    await waitFor(() => expect(view.getByText('App content')).toBeTruthy());
    expect(initialize).toHaveBeenCalledTimes(2);
  });
});
