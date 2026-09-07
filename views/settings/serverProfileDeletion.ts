import {removeCredentials} from '../../helpers/secureStorage';
import {removeServerProfile} from '../../store/settings';
import type {AppDispatch} from '../../store/store';

/**
 * Retire secure data before removing the Redux profile. Keychain reset is
 * idempotent for profiles that never stored credentials.
 */
export const deleteServerProfile = async (
  profileId: string,
  dispatch: AppDispatch,
): Promise<void> => {
  await removeCredentials(profileId);
  dispatch(removeServerProfile(profileId));
};
