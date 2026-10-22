import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  resource,
  signal,
} from '@angular/core';
import {
  DIALOG_DATA,
  DialogRef,
  EsButton,
  EsDialogService,
  EsDialogShell,
  EsEmptyState,
  EsSkeleton,
  EsToastService,
} from '@elikarsystems/ui';
import { LucideCamera, LucideImage, LucideStar, LucideTrash2 } from '@lucide/angular';
import {
  type ItemPhoto,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_ITEM,
  PHOTO_ACCEPT,
} from '@silopro/contracts';
import { Api, ApiRequestError } from '../../core/api';
import { ConfirmService } from '../../core/confirm';
import { LoadingImage } from '../../core/loading-image';

interface ViewerData {
  src: string;
  title: string;
}

@Component({
  selector: 'sp-photo-viewer',
  imports: [EsDialogShell, EsSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell [title]="data.title">
      @if (!loaded()) {
        <es-skeleton class="mx-auto aspect-square w-full max-w-[min(70vh,100%)] rounded-md" />
      }
      <img
        [src]="data.src"
        [alt]="data.title"
        class="mx-auto max-h-[70vh] w-auto rounded-md"
        [class.hidden]="!loaded()"
        (load)="loaded.set(true)"
        (error)="loaded.set(true)"
      />
    </es-dialog-shell>
  `,
})
class PhotoViewer {
  protected readonly data = inject<ViewerData>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  protected readonly loaded = signal(false);
}

/** Galería de fotografías de un artículo con subida, portada y borrado. */
@Component({
  selector: 'sp-item-photos',
  imports: [
    EsButton,
    EsEmptyState,
    EsSkeleton,
    LoadingImage,
    LucideCamera,
    LucideImage,
    LucideStar,
    LucideTrash2,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      @if (canWrite()) {
        <div class="flex flex-wrap items-center gap-2">
          <input
            #picker
            type="file"
            class="sr-only"
            [accept]="accept"
            multiple
            aria-label="Elegir fotografías"
            (change)="upload($any($event.target))"
          />
          <button
            esButton
            [loading]="uploading()"
            [disabled]="remaining() <= 0"
            (click)="picker.click()"
          >
            <svg lucideCamera></svg> Agregar fotografías
          </button>
          <span class="text-xs text-fg-muted">
            JPEG, PNG o WebP de hasta {{ maxMb }} MB · {{ photos().length }}/{{ max }}. Se eliminan
            los datos de ubicación y cámara.
          </span>
        </div>
      }
      @if (!photos().length && list.isLoading()) {
        <ul
          class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5"
          aria-label="Cargando fotografías"
          aria-busy="true"
        >
          @for (n of [1, 2, 3, 4]; track n) {
            <li><es-skeleton class="aspect-square w-full rounded-lg" /></li>
          }
        </ul>
      } @else if (!photos().length && list.hasValue()) {
        <es-empty-state
          title="Sin fotografías"
          description="Una foto ayuda a reconocer la pieza en el cajón."
        >
          <svg esEmptyIcon lucideImage></svg>
        </es-empty-state>
      } @else {
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5" aria-label="Fotografías">
          @for (p of photos(); track p.id; let first = $first) {
            <li class="group relative overflow-hidden rounded-lg border border-border bg-surface">
              <button
                type="button"
                class="block aspect-square w-full cursor-zoom-in"
                [attr.aria-label]="'Ver fotografía ' + ($index + 1) + ' en grande'"
                (click)="view(p, $index)"
              >
                <img
                  spLoading
                  [src]="src(p, 'thumb')"
                  alt=""
                  loading="lazy"
                  class="size-full object-cover"
                  [width]="240"
                  [height]="240"
                />
              </button>
              @if (first) {
                <span
                  class="absolute top-1.5 left-1.5 rounded-sm bg-surface/90 px-1.5 py-0.5 text-2xs font-medium"
                  >Portada</span
                >
              }
              @if (canWrite()) {
                <div
                  class="absolute right-1.5 bottom-1.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                >
                  @if (!first) {
                    <button
                      esButton
                      size="sm"
                      iconOnly
                      [attr.aria-label]="'Usar fotografía ' + ($index + 1) + ' como portada'"
                      (click)="makeCover(p)"
                    >
                      <svg lucideStar></svg>
                    </button>
                  }
                  <button
                    esButton
                    size="sm"
                    iconOnly
                    [attr.aria-label]="'Eliminar fotografía ' + ($index + 1)"
                    (click)="remove(p)"
                  >
                    <svg lucideTrash2></svg>
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class ItemPhotos {
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  private readonly dialog = inject(EsDialogService);
  private readonly confirm = inject(ConfirmService);

  readonly itemId = input.required<string>();
  readonly itemName = input('');
  readonly canWrite = input(false);
  /** Avisa al detalle para refrescar la portada. */
  readonly changed = output<void>();

  protected readonly accept = PHOTO_ACCEPT.join(',');
  protected readonly max = MAX_PHOTOS_PER_ITEM;
  protected readonly maxMb = MAX_PHOTO_BYTES / 1024 / 1024;
  protected readonly uploading = signal(false);

  protected readonly list = resource({
    params: () => this.itemId(),
    loader: ({ params }) => this.api.get<ItemPhoto[]>(`/items/${params}/photos`),
  });
  protected readonly photos = computed(() => this.list.value() ?? []);
  protected readonly remaining = computed(() => this.max - this.photos().length);

  protected src(p: ItemPhoto, size: 'thumb' | 'full'): string {
    return this.api.url(`/items/${this.itemId()}/photos/${p.id}/${size}`);
  }

  protected async upload(picker: HTMLInputElement): Promise<void> {
    const files = [...(picker.files ?? [])];
    picker.value = '';
    if (!files.length) return;
    const room = this.remaining();
    if (files.length > room) {
      this.toast.show(`Solo caben ${room} fotografías más`, { tone: 'warning' });
    }
    this.uploading.set(true);
    let ok = 0;
    for (const file of files.slice(0, room)) {
      if (file.size > MAX_PHOTO_BYTES) {
        this.toast.show(`${file.name}: supera ${this.maxMb} MB`, { tone: 'danger' });
        continue;
      }
      try {
        await this.api.upload(`/items/${this.itemId()}/photos`, file, file.name);
        ok++;
      } catch (e) {
        this.toast.show(`${file.name}: ${ApiRequestError.from(e).message}`, { tone: 'danger' });
      }
    }
    this.uploading.set(false);
    if (ok) {
      this.toast.show(ok === 1 ? 'Fotografía agregada' : `${ok} fotografías agregadas`, {
        tone: 'success',
      });
      this.list.reload();
      this.changed.emit();
    }
  }

  protected async makeCover(p: ItemPhoto): Promise<void> {
    try {
      this.list.set(
        await this.api.post<ItemPhoto[]>(`/items/${this.itemId()}/photos/${p.id}/portada`, {}),
      );
      this.changed.emit();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }

  protected async remove(p: ItemPhoto): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar fotografía',
      message: 'La imagen se borrará definitivamente.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/items/${this.itemId()}/photos/${p.id}`);
      this.list.reload();
      this.changed.emit();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }

  protected view(p: ItemPhoto, index: number): void {
    this.dialog.open<void, ViewerData>(PhotoViewer, {
      size: 'lg',
      data: { src: this.src(p, 'full'), title: `${this.itemName()} · foto ${index + 1}` },
      ariaLabel: 'Fotografía',
    });
  }
}
