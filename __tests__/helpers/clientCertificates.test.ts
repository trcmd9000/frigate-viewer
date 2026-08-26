jest.mock('@react-native-async-storage/async-storage');

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}));

import ClientCertificateManager from '../../helpers/clientCertificates';

describe('ClientCertificateManager', () => {
  let manager: ClientCertificateManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new ClientCertificateManager();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getDaysUntilExpiry', () => {
    it('should calculate days until expiry correctly', () => {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 30);

      const daysUntilExpiry = manager.getDaysUntilExpiry(futureDate);
      expect(daysUntilExpiry).toBe(30);
    });

    it('should return negative value for expired certificate', () => {
      const today = new Date();
      const pastDate = new Date(today);
      pastDate.setDate(pastDate.getDate() - 10);

      const daysUntilExpiry = manager.getDaysUntilExpiry(pastDate);
      expect(daysUntilExpiry).toBeLessThan(0);
    });

    it('should return 0 or negative for certificate expiring today', () => {
      const today = new Date();
      const daysUntilExpiry = manager.getDaysUntilExpiry(today);
      expect(daysUntilExpiry).toBeLessThanOrEqual(0);
    });

    it('should calculate calendar days across daylight-saving changes', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 26, 12));

      expect(
        manager.getDaysUntilExpiry(new Date(2026, 9, 25, 12)),
      ).toBe(60);
    });
  });

  describe('getExpiryStatus', () => {
    it('should return expired status for past date', () => {
      const today = new Date();
      const pastDate = new Date(today);
      pastDate.setDate(pastDate.getDate() - 10);

      const status = manager.getExpiryStatus(pastDate);

      expect(status.isExpired).toBe(true);
      expect(status.daysUntilExpiry).toBeLessThan(0);
      expect(status.warningMessage).toContain('EXPIRED');
    });

    it('should return warning for certificate expiring within 30 days', () => {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 15);

      const status = manager.getExpiryStatus(futureDate);

      expect(status.isExpired).toBe(false);
      expect(status.daysUntilExpiry).toBe(15);
      expect(status.warningMessage).toContain('EXPIRES IN');
      expect(status.warningMessage).toContain('15');
    });

    it('should return no warning for certificate expiring after 30 days', () => {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 60);

      const status = manager.getExpiryStatus(futureDate);

      expect(status.isExpired).toBe(false);
      expect(status.daysUntilExpiry).toBe(60);
      expect(status.warningMessage).toBeUndefined();
    });

    it('should distinguish between expired and expiring', () => {
      const today = new Date();

      // Expired certificate
      const expired = new Date(today);
      expired.setDate(expired.getDate() - 1);
      const expiredStatus = manager.getExpiryStatus(expired);

      // Expiring soon certificate
      const expiringSoon = new Date(today);
      expiringSoon.setDate(expiringSoon.getDate() + 15);
      const expiringSoonStatus = manager.getExpiryStatus(expiringSoon);

      expect(expiredStatus.isExpired).toBe(true);
      expect(expiringSoonStatus.isExpired).toBe(false);
      expect(expiredStatus.warningMessage).toContain('EXPIRED');
      expect(expiringSoonStatus.warningMessage).toContain('EXPIRES IN');
    });

    it('should correctly handle zero-day certificate', () => {
      const today = new Date();
      const status = manager.getExpiryStatus(today);

      // Today is the expiration date, so it could be expired or about to be
      expect(status.daysUntilExpiry).toBeLessThanOrEqual(0);
      expect(status.warningMessage).toBeDefined();
    });

    it('should handle far future certificate expiration', () => {
      const today = new Date();
      const farFuture = new Date(today);
      farFuture.setFullYear(farFuture.getFullYear() + 5);

      const status = manager.getExpiryStatus(farFuture);
      expect(status.isExpired).toBe(false);
      expect(status.warningMessage).toBeUndefined();
    });

    it('should correctly handle 30 days threshold', () => {
      const today = new Date();
      const exactly30Days = new Date(today);
      exactly30Days.setDate(exactly30Days.getDate() + 30);

      const status = manager.getExpiryStatus(exactly30Days);
      expect(status.daysUntilExpiry).toBe(30);
    });

    it('should provide consistent warning messages', () => {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 15);

      const status = manager.getExpiryStatus(futureDate);
      expect(status.warningMessage).toBeDefined();
      expect(status.warningMessage).toContain('15');
    });
  });

  describe('isAvailable', () => {
    it('should indicate if native module is available', () => {
      const available = manager.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Certificate validation states', () => {
    it('should identify certificates about to expire', () => {
      const today = new Date();
      const soon = new Date(today);
      soon.setDate(soon.getDate() + 7);

      const status = manager.getExpiryStatus(soon);
      expect(status.isExpired).toBe(false);
      expect(status.daysUntilExpiry).toBe(7);
      expect(status.warningMessage).toBeDefined();
    });

    it('should handle certificate metadata with valid dates', () => {
      const notAfter = new Date('2025-12-31');

      const daysUntilExpiry = manager.getDaysUntilExpiry(notAfter);
      expect(typeof daysUntilExpiry).toBe('number');
    });
  });
});
