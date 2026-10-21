import { Clipboard } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  DIALOG_DATA,
  DialogRef,
  EsBadge,
  EsButton,
  EsDialogService,
  EsDialogShell,
  EsFormField,
  EsInput,
  EsSelect,
  EsSkeleton,
  EsTable,
  EsToastService,
} from '@elikarsystems/ui';
import {
  LucideCopy,
  LucideLogOut,
  LucideUserMinus,
  LucideUserPlus,
  LucideX,
} from '@lucide/angular';
import {
  INVITATION_TTL_DAYS,
  type Invitation,
  type InvitationCreated,
  invitationInputSchema,
  type InvitationStatus,
  type Member,
  ROLE_VALUES,
  type RoleValue,
} from '@silopro/contracts';
import { checkMembershipChange, ROLE_LABELS } from '@silopro/domain';
import { Api, ApiRequestError } from '../../core/api';
import { ConfirmService } from '../../core/confirm';
import { fmtDate } from '../../core/format';
import { zodErrors } from '../../core/forms';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

const ROLE_HINTS: Record<RoleValue, string> = {
  owner: 'Control total, incluida la administración de propietarios.',
  admin: 'Catálogo, existencias, ajustes y miembros (salvo propietarios).',
  operator: 'Consulta y registra entradas y salidas.',
  viewer: 'Solo consulta.',
};

const STATUS: Record<
  InvitationStatus,
  { label: string; tone: 'primary' | 'success' | 'neutral' | 'warning' }
> = {
  pending: { label: 'Pendiente', tone: 'primary' },
  accepted: { label: 'Aceptada', tone: 'success' },
  revoked: { label: 'Cancelada', tone: 'neutral' },
  expired: { label: 'Vencida', tone: 'warning' },
};

@Component({
  selector: 'sp-invite-dialog',
  imports: [EsDialogShell, EsButton, EsFormField, EsInput, EsSelect, LucideCopy],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell
      title="Invitar a la organización"
      [description]="'El enlace vence en ' + ttl + ' días y solo sirve para ese correo.'"
    >
      @if (created(); as c) {
        <div class="flex flex-col gap-3">
          <p class="text-sm">
            Envía este enlace a <strong>{{ c.email }}</strong> por el medio que prefieras. Por
            seguridad no se volverá a mostrar.
          </p>
          <div class="flex gap-2">
            <input
              esInput
              mono
              readonly
              [value]="c.url"
              aria-label="Enlace de invitación"
              (focus)="$any($event.target).select()"
            />
            <button esButton variant="primary" (click)="copy(c.url)">
              <svg lucideCopy></svg> Copiar
            </button>
          </div>
        </div>
      } @else {
        <form
          id="invite-form"
          class="flex flex-col gap-3"
          (submit)="$event.preventDefault(); send()"
          novalidate
        >
          @if (error()) {
            <p class="rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger" role="alert">
              {{ error() }}
            </p>
          }
          <es-form-field
            label="Correo electrónico"
            required
            [error]="fields()['email']"
            #e="esFormField"
          >
            <input
              esInput
              type="email"
              [id]="e.controlId"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
              [attr.aria-describedby]="e.describedBy()"
              [attr.aria-invalid]="!!fields()['email']"
            />
          </es-form-field>
          <es-form-field label="Rol" [hint]="hint()" #r="esFormField">
            <select
              esSelect
              [id]="r.controlId"
              [value]="role()"
              (change)="role.set($any($event.target).value)"
              [attr.aria-describedby]="r.describedBy()"
            >
              @for (opt of data.roles; track opt) {
                <option [value]="opt">{{ label(opt) }}</option>
              }
            </select>
          </es-form-field>
        </form>
      }
      <ng-container esDialogFooter>
        @if (created()) {
          <button esButton (click)="ref.close(true)">Listo</button>
        } @else {
          <button esButton type="button" (click)="ref.close()">Cancelar</button>
          <button esButton variant="primary" type="submit" form="invite-form" [loading]="busy()">
            Crear enlace
          </button>
        }
      </ng-container>
    </es-dialog-shell>
  `,
})
class InviteDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<{ roles: RoleValue[] }>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly clipboard = inject(Clipboard);
  private readonly toast = inject(EsToastService);
  protected readonly ttl = INVITATION_TTL_DAYS;
  protected readonly email = signal('');
  protected readonly role = signal<RoleValue>(
    this.data.roles.includes('operator') ? 'operator' : this.data.roles[0]!,
  );
  protected readonly hint = computed(() => ROLE_HINTS[this.role()]);
  protected readonly fields = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly created = signal<InvitationCreated | null>(null);

  protected label(r: RoleValue): string {
    return ROLE_LABELS[r];
  }

  protected async send(): Promise<void> {
    const parsed = invitationInputSchema.safeParse({ email: this.email(), role: this.role() });
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    if (!parsed.success) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.created.set(await this.api.post<InvitationCreated>('/invitations', parsed.data));
    } catch (e) {
      this.error.set(ApiRequestError.from(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected copy(url: string): void {
    this.clipboard.copy(url);
    this.toast.show('Enlace copiado', { tone: 'success' });
  }
}

@Component({
  selector: 'sp-members',
  imports: [
    PageHeader,
    EsBadge,
    EsButton,
    EsSelect,
    EsSkeleton,
    EsTable,
    LucideUserPlus,
    LucideUserMinus,
    LucideX,
    LucideLogOut,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <sp-page-header
        title="Miembros"
        description="Quién tiene acceso a esta organización y con qué rol."
      >
        @if (canManage()) {
          <button spActions esButton variant="primary" (click)="invite()">
            <svg lucideUserPlus></svg> Invitar
          </button>
        }
      </sp-page-header>

      <section
        class="overflow-x-auto rounded-lg border border-border bg-surface"
        aria-label="Miembros"
      >
        @if (members.isLoading() && !members.hasValue()) {
          <div class="p-3"><es-skeleton class="h-12 w-full" /></div>
        } @else {
          <table esTable>
            <caption class="sr-only">
              Miembros
            </caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col" class="w-48">Rol</th>
                <th scope="col" class="w-36">Desde</th>
                <th scope="col" class="w-12"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (m of members.value(); track m.userId) {
                <tr>
                  <td class="font-medium">
                    {{ m.name }}
                    @if (m.userId === me()) {
                      <span class="text-fg-muted">(tú)</span>
                    }
                  </td>
                  <td class="text-fg-muted">{{ m.email }}</td>
                  <td>
                    @if (roleOptions(m).length > 1) {
                      <select
                        esSelect
                        class="h-6 text-xs"
                        [value]="m.role"
                        [attr.aria-label]="'Rol de ' + m.name"
                        (change)="changeRole(m, $any($event.target).value)"
                      >
                        @for (r of roleOptions(m); track r) {
                          <option [value]="r">{{ label(r) }}</option>
                        }
                      </select>
                    } @else {
                      <es-badge [tone]="m.role === 'owner' ? 'primary' : 'neutral'">{{
                        label(m.role)
                      }}</es-badge>
                    }
                  </td>
                  <td class="text-fg-muted tabular-nums">{{ date(m.joinedAt) }}</td>
                  <td>
                    @if (m.userId === me()) {
                      @if (canRemove(m)) {
                        <button
                          esButton
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label="Abandonar la organización"
                          (click)="remove(m)"
                        >
                          <svg lucideLogOut></svg>
                        </button>
                      }
                    } @else if (canRemove(m)) {
                      <button
                        esButton
                        variant="ghost"
                        size="sm"
                        iconOnly
                        [attr.aria-label]="'Quitar a ' + m.name"
                        (click)="remove(m)"
                      >
                        <svg lucideUserMinus></svg>
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </section>

      @if (canManage()) {
        <section class="flex flex-col gap-2" aria-labelledby="inv-title">
          <h2 id="inv-title" class="text-sm font-semibold">Invitaciones</h2>
          @if (!(invitations.value() ?? []).length) {
            <p class="text-sm text-fg-muted">
              No hay invitaciones. Usa «Invitar» para sumar a tu equipo.
            </p>
          } @else {
            <div class="overflow-x-auto rounded-lg border border-border bg-surface">
              <table esTable>
                <caption class="sr-only">
                  Invitaciones
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Correo</th>
                    <th scope="col" class="w-36">Rol</th>
                    <th scope="col" class="w-32">Estado</th>
                    <th scope="col" class="w-44">Vence</th>
                    <th scope="col" class="w-12"><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (i of invitations.value(); track i.id) {
                    <tr>
                      <td>{{ i.email }}</td>
                      <td>{{ label(i.role) }}</td>
                      <td>
                        <es-badge [tone]="status(i).tone">{{ status(i).label }}</es-badge>
                      </td>
                      <td class="text-fg-muted tabular-nums">{{ date(i.expiresAt) }}</td>
                      <td>
                        @if (i.status === 'pending') {
                          <button
                            esButton
                            variant="ghost"
                            size="sm"
                            iconOnly
                            [attr.aria-label]="'Cancelar invitación de ' + i.email"
                            (click)="revoke(i)"
                          >
                            <svg lucideX></svg>
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </div>
  `,
})
export default class Members {
  private readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly toast = inject(EsToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);
  protected readonly date = fmtDate;
  protected readonly me = computed(() => this.session.me()?.user.id);
  protected readonly canManage = computed(() => this.session.can('members.manage'));

  protected readonly members = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<Member[]>('/members'),
  });
  protected readonly invitations = resource({
    params: () => (this.canManage() ? this.session.orgId() : undefined),
    loader: () => this.api.get<Invitation[]>('/invitations'),
  });
  private readonly ownerCount = computed(
    () => (this.members.value() ?? []).filter((m) => m.role === 'owner').length,
  );

  protected label(r: RoleValue): string {
    return ROLE_LABELS[r];
  }

  protected status(i: Invitation) {
    return STATUS[i.status];
  }

  /** Roles a los que el usuario actual puede cambiar a este miembro (incluye el actual). */
  protected roleOptions(m: Member): RoleValue[] {
    const actor = this.session.role();
    if (!actor) return [m.role];
    return ROLE_VALUES.filter(
      (r) =>
        r === m.role ||
        checkMembershipChange({
          actor,
          current: m.role,
          next: r,
          ownerCount: this.ownerCount(),
          self: m.userId === this.me(),
        }) === null,
    );
  }

  protected canRemove(m: Member): boolean {
    const actor = this.session.role();
    return (
      !!actor &&
      checkMembershipChange({
        actor,
        current: m.role,
        next: null,
        ownerCount: this.ownerCount(),
        self: m.userId === this.me(),
      }) === null
    );
  }

  protected invite(): void {
    const actor = this.session.role();
    const roles = ROLE_VALUES.filter(
      (r) =>
        !!actor &&
        checkMembershipChange({ actor, current: null, next: r, ownerCount: this.ownerCount() }) ===
          null,
    );
    this.dialog
      .open<boolean, { roles: RoleValue[] }>(InviteDialog, {
        data: { roles },
        ariaLabel: 'Invitar',
      })
      .closed.subscribe(() => this.invitations.reload());
  }

  protected async changeRole(m: Member, role: RoleValue): Promise<void> {
    try {
      this.members.set(await this.api.patch<Member[]>(`/members/${m.userId}`, { role }));
      this.toast.show(`${m.name} ahora es ${ROLE_LABELS[role].toLowerCase()}`, { tone: 'success' });
      if (m.userId === this.me()) await this.session.load();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
      this.members.reload();
    }
  }

  protected async remove(m: Member): Promise<void> {
    const self = m.userId === this.me();
    const ok = await this.confirm.ask({
      title: self ? 'Abandonar la organización' : 'Quitar miembro',
      message: self
        ? 'Perderás el acceso a esta organización. Para volver necesitarás otra invitación.'
        : `${m.name} perderá el acceso a esta organización.`,
      confirmLabel: self ? 'Abandonar' : 'Quitar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/members/${m.userId}`);
      if (self) {
        await this.session.load();
        await this.router.navigateByUrl('/');
        return;
      }
      this.toast.show(`${m.name} ya no es miembro`);
      this.members.reload();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }

  protected async revoke(i: Invitation): Promise<void> {
    try {
      await this.api.delete(`/invitations/${i.id}`);
      this.invitations.reload();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }
}
