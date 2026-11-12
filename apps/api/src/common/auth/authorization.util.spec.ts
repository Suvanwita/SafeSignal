import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  assertOwnedResource,
  assertOwnership,
  assertResourceExists,
  isOwner,
} from './authorization.util';

describe('authorization.util', () => {
  describe('isOwner', () => {
    it('returns true when resourceUserId matches currentUserId', () => {
      expect(isOwner('user-1', 'user-1')).toBe(true);
    });

    it('returns false when resourceUserId does not match currentUserId', () => {
      expect(isOwner('user-1', 'user-2')).toBe(false);
    });
  });

  describe('assertOwnership', () => {
    it('does not throw when user owns the resource', () => {
      expect(() =>
        assertOwnership('user-1', 'user-1', 'Incident'),
      ).not.toThrow();
    });

    it('throws ForbiddenException when user does not own the resource', () => {
      expect(() => assertOwnership('user-1', 'user-2', 'Incident')).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertResourceExists', () => {
    it('does not throw when resource is present', () => {
      expect(() =>
        assertResourceExists({ id: 'inc-1' }, 'Incident'),
      ).not.toThrow();
    });

    it('throws NotFoundException when resource is null or undefined', () => {
      expect(() => assertResourceExists(null, 'Incident')).toThrow(
        NotFoundException,
      );
      expect(() => assertResourceExists(undefined, 'Incident')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertOwnedResource', () => {
    it('passes when resource exists and belongs to current user', () => {
      const incident = { id: 'inc-1', userId: 'user-1' };
      expect(() =>
        assertOwnedResource(incident, 'user-1', 'Incident'),
      ).not.toThrow();
    });

    it('throws NotFoundException when resource does not exist', () => {
      expect(() =>
        assertOwnedResource(null, 'user-1', 'Incident'),
      ).toThrow(NotFoundException);
    });

    it('throws ForbiddenException when resource belongs to another user', () => {
      const incident = { id: 'inc-1', userId: 'user-2' };
      expect(() =>
        assertOwnedResource(incident, 'user-1', 'Incident'),
      ).toThrow(ForbiddenException);
    });
  });
});
