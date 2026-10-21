import { describe, expect, it } from 'vitest';
import { checkMembershipChange } from './permissions.js';

describe('checkMembershipChange', () => {
  it('el propietario puede nombrar otro propietario', () => {
    expect(
      checkMembershipChange({ actor: 'owner', current: 'admin', next: 'owner', ownerCount: 1 }),
    ).toBeNull();
  });

  it('un administrador no puede tocar propietarios ni crear uno', () => {
    expect(
      checkMembershipChange({ actor: 'admin', current: 'owner', next: 'viewer', ownerCount: 2 }),
    ).toBe('OWNER_ONLY');
    expect(
      checkMembershipChange({ actor: 'admin', current: null, next: 'owner', ownerCount: 1 }),
    ).toBe('OWNER_ONLY');
    expect(
      checkMembershipChange({ actor: 'admin', current: 'operator', next: 'admin', ownerCount: 1 }),
    ).toBeNull();
  });

  it('operadores y consulta no administran miembros', () => {
    expect(
      checkMembershipChange({ actor: 'operator', current: 'viewer', next: null, ownerCount: 1 }),
    ).toBe('FORBIDDEN');
  });

  it('protege al último propietario, incluso de sí mismo', () => {
    expect(
      checkMembershipChange({ actor: 'owner', current: 'owner', next: 'admin', ownerCount: 1 }),
    ).toBe('LAST_OWNER');
    expect(
      checkMembershipChange({
        actor: 'owner',
        current: 'owner',
        next: null,
        ownerCount: 1,
        self: true,
      }),
    ).toBe('LAST_OWNER');
    expect(
      checkMembershipChange({ actor: 'owner', current: 'owner', next: null, ownerCount: 2 }),
    ).toBeNull();
  });

  it('cualquiera puede abandonar la organización', () => {
    expect(
      checkMembershipChange({
        actor: 'viewer',
        current: 'viewer',
        next: null,
        ownerCount: 1,
        self: true,
      }),
    ).toBeNull();
  });
});
