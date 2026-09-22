import {assertRemoteHttps, RemoteHttpUnsupportedError} from '../../helpers/remoteHttpPolicy';

describe('remote HTTP policy', () => {
  it('allows remote HTTPS', () => {
    expect(() => assertRemoteHttps({protocol: 'https'})).not.toThrow();
  });

  it('always blocks remote HTTP', () => {
    expect(() => assertRemoteHttps({protocol: 'http'})).toThrow(
      RemoteHttpUnsupportedError,
    );
  });
});