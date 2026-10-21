import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { LoginInput, Me, RegisterInput } from '@silopro/contracts';
import { can, type Permission } from '@silopro/domain';
import { firstValueFrom } from 'rxjs';

const ORG_KEY = 'sp-org';

/** Sesión del usuario y organización activa. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  readonly me = signal<Me | null>(null);
  readonly loaded = signal(false);
  private readonly selectedOrg = signal<string | null>(readOrg());

  readonly orgId = computed(() => {
    const me = this.me();
    if (!me) return null;
    const sel = this.selectedOrg();
    return (
      me.memberships.find((m) => m.organizationId === sel)?.organizationId ??
      me.memberships[0]?.organizationId ??
      null
    );
  });
  readonly membership = computed(
    () => this.me()?.memberships.find((m) => m.organizationId === this.orgId()) ?? null,
  );
  readonly role = computed(() => this.membership()?.role ?? null);
  readonly canWrite = computed(() => this.can('catalog.write'));
  readonly canMove = computed(() => this.can('stock.move'));
  readonly canAdjust = computed(() => this.can('stock.adjust'));

  /** Misma matriz de permisos que la API; la API sigue siendo la autoridad. */
  can(permission: Permission): boolean {
    const role = this.role();
    return role !== null && can(role, permission);
  }

  /** Carga la sesión al arrancar; un 401 simplemente deja al usuario fuera. */
  async load(): Promise<void> {
    try {
      this.me.set(
        await firstValueFrom(this.http.get<Me>('/api/auth/me', { withCredentials: true })),
      );
    } catch {
      this.me.set(null);
    } finally {
      this.loaded.set(true);
    }
  }

  async login(input: LoginInput): Promise<void> {
    this.me.set(await firstValueFrom(this.http.post<Me>('/api/auth/login', input)));
  }

  async register(input: RegisterInput): Promise<void> {
    this.me.set(await firstValueFrom(this.http.post<Me>('/api/auth/register', input)));
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } finally {
      this.me.set(null);
    }
  }

  selectOrg(id: string): void {
    this.selectedOrg.set(id);
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {
      /* sin almacenamiento local */
    }
  }
}

function readOrg(): string | null {
  try {
    return localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}
