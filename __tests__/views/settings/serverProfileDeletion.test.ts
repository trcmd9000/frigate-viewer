import {deleteServerProfile} from '../../../views/settings/serverProfileDeletion';
import {removeCredentials} from '../../../helpers/secureStorage';
import {invalidateServerSession} from '../../../helpers/rest';
import {removeServerProfile} from '../../../store/settings';
import type {Server} from '../../../store/settings';

jest.mock('../../../helpers/secureStorage', () => ({
  removeCredentials: jest.fn(),
}));

jest.mock('../../../helpers/rest', () => ({
  invalidateServerSession: jest.fn(),
}));

describe('server profile deletion transaction', () => {
  const dispatch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (removeCredentials as jest.Mock).mockResolvedValue(undefined);
  });

  it('removes profile-scoped credentials before deleting the profile', async () => {
    await deleteServerProfile('profile-with-credentials', dispatch);

    expect(removeCredentials).toHaveBeenCalledWith('profile-with-credentials');
    expect(dispatch).toHaveBeenCalledWith(
      removeServerProfile('profile-with-credentials'),
    );
  });

  it('treats a profile without credentials as an idempotent reset', async () => {
    (removeCredentials as jest.Mock).mockResolvedValue(undefined);

    await expect(
      deleteServerProfile('profile-without-credentials', dispatch),
    ).resolves.toBeUndefined();

    expect(dispatch).toHaveBeenCalledWith(
      removeServerProfile('profile-without-credentials'),
    );
  });

  it('retires the profile cookie session before secure deletion', async () => {
    const server: Server = {
      profileId: 'profile-with-cookies',
      protocol: 'https',
      host: 'example.test',
      port: 443,
      path: '',
      auth: 'frigate',
      credentials: {username: 'viewer', password: 'secret'},
    };

    await deleteServerProfile('profile-with-cookies', dispatch, server);

    expect(invalidateServerSession).toHaveBeenCalledWith(server);
    expect(removeCredentials).toHaveBeenCalledWith(server.profileId);
  });

  it('keeps the profile when secure deletion fails', async () => {
    const failure = new Error('secure storage unavailable');
    (removeCredentials as jest.Mock).mockRejectedValue(failure);

    await expect(
      deleteServerProfile('profile-failed', dispatch),
    ).rejects.toBe(failure);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('supports deleting both active and non-active profile IDs', async () => {
    await deleteServerProfile('profile-active', dispatch);
    await deleteServerProfile('profile-other', dispatch);

    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      removeServerProfile('profile-active'),
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      removeServerProfile('profile-other'),
    );
  });
});
