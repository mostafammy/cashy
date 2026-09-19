import { describe, it, expect } from 'vitest';
import { isOwner } from '../../src/lib/permissions.js';

describe('isOwner', () => {
  it('returns true when userId is in ownerIds', () => {
    expect(isOwner(['111', '222'], '222')).toBe(true);
  });

  it('returns false when userId is not in ownerIds', () => {
    expect(isOwner(['111', '222'], '333')).toBe(false);
  });
});
