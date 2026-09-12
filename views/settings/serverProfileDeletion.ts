import {removeCredentials} from '../../helpers/secureStorage';
import {invalidateServerSession} from '../../helpers/rest';
import {removeServerProfile} from '../../store/settings';
import type {AppDispatch} from '../../store/store';
import type {Server} from '../../store/settings';

/**
 * Retire the profile-bound native session and secure data before removing the
 * Redux profile. Keychain reset is idempotent for profiles without credentials.
 */
export const deleteServerProfile = async (
  profileId: string,
  dispatch: AppDispatch,
  server?: Server,
): Promise<void> => {
  if (server) {
    invalidateServerSession(server);
  }
  await removeCredentials(profileId);
  dispatch(removeServerProfile(profileId));
};
