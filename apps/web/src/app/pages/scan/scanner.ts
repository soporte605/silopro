import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { EsButton, EsFormField, EsInput } from '@elikarsystems/ui';
import { LucideQrCode } from '@lucide/angular';
import { decodeQrReference, type QrReference } from '@silopro/contracts';
import { PageHeader } from '../page-header';

type State = 'starting' | 'scanning' | 'denied' | 'unavailable';

/** Lector de QR del navegador (Chrome/Android); en el resto se usa jsQR. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare const BarcodeDetector:
  (new (opts: { formats: string[] }) => BarcodeDetectorLike) | undefined;

const LETTER: Record<QrReference['type'], string> = { item: 'a', location: 'u' };

/**
 * Escanea etiquetas con la cámara del celular sin salir de la app. Necesita
 * HTTPS (o localhost) y permiso de cámara; si no hay, se puede pegar el enlace
 * o el texto de la etiqueta.
 */
@Component({
  selector: 'sp-scanner',
  imports: [PageHeader, EsButton, EsFormField, EsInput, LucideQrCode],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Escanear etiqueta"
        description="Apunte la cámara al QR de un cajón, una ubicación o un artículo."
      />
      <div
        class="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-black"
        [attr.data-state]="state()"
      >
        <video
          #video
          class="size-full object-cover"
          playsinline
          muted
          aria-label="Vista de la cámara"
        ></video>
        @if (state() === 'scanning') {
          <div
            class="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/80"
            aria-hidden="true"
          ></div>
        } @else {
          <div
            class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white"
          >
            <svg lucideQrCode [size]="32"></svg>
            <p role="status">{{ message() }}</p>
            @if (state() !== 'starting') {
              <button esButton size="sm" (click)="start()">Reintentar</button>
            }
          </div>
        }
      </div>
      @if (notRecognized(); as text) {
        <p class="rounded-md bg-warning-soft px-3 py-2 text-sm" role="alert">
          Este QR no es de una etiqueta de SiloPro: «{{ text }}».
        </p>
      }
      <form class="flex items-end gap-2" (submit)="$event.preventDefault(); manual()">
        <es-form-field label="O pegue el enlace de la etiqueta" class="flex-1" #m="esFormField">
          <input
            esInput
            [id]="m.controlId"
            placeholder="https://…/q/u/ABC123"
            [value]="typed()"
            (input)="typed.set($any($event.target).value)"
          />
        </es-form-field>
        <button esButton type="submit" class="mb-0.5">Abrir</button>
      </form>
    </div>
  `,
})
export default class Scanner {
  private readonly router = inject(Router);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  protected readonly state = signal<State>('starting');
  protected readonly message = signal('Abriendo la cámara…');
  protected readonly notRecognized = signal<string | null>(null);
  protected readonly typed = signal('');

  private stream: MediaStream | null = null;
  private frame = 0;
  private stopped = false;
  private readonly canvas = document.createElement('canvas');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    queueMicrotask(() => void this.start());
  }

  protected async start(): Promise<void> {
    this.stop();
    this.stopped = false;
    this.state.set('starting');
    this.message.set('Abriendo la cámara…');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fail('unavailable', 'Este navegador no permite usar la cámara aquí (hace falta HTTPS).');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch (e) {
      const denied = e instanceof DOMException && e.name === 'NotAllowedError';
      this.fail(
        denied ? 'denied' : 'unavailable',
        denied
          ? 'No hay permiso para usar la cámara. Actívelo en el navegador y reintente.'
          : 'No se encontró una cámara disponible.',
      );
      return;
    }
    if (this.stopped) return this.stop();
    const video = this.video().nativeElement;
    video.srcObject = this.stream;
    await video.play().catch(() => undefined);
    this.state.set('scanning');
    void this.loop(await this.decoder());
  }

  /** Lector nativo si existe; si no, jsQR (se descarga solo al usarlo). */
  private async decoder(): Promise<(v: HTMLVideoElement) => Promise<string | null>> {
    if (typeof BarcodeDetector !== 'undefined') {
      const native = new BarcodeDetector({ formats: ['qr_code'] });
      return async (v) => (await native.detect(v))[0]?.rawValue ?? null;
    }
    const { default: jsQR } = await import('jsqr');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    return async (v) => {
      if (!v.videoWidth) return null;
      // Basta una imagen reducida: más rápido en celulares modestos.
      const scale = Math.min(1, 640 / v.videoWidth);
      this.canvas.width = Math.round(v.videoWidth * scale);
      this.canvas.height = Math.round(v.videoHeight * scale);
      ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height);
      const img = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      return jsQR(img.data, img.width, img.height)?.data ?? null;
    };
  }

  private async loop(decode: (v: HTMLVideoElement) => Promise<string | null>): Promise<void> {
    const video = this.video().nativeElement;
    let last = 0;
    const tick = async (t: number) => {
      if (this.stopped) return;
      if (t - last > 150 && video.readyState >= 2) {
        last = t;
        const text = await decode(video).catch(() => null);
        if (text && this.open(text)) return;
      }
      this.frame = requestAnimationFrame((n) => void tick(n));
    };
    this.frame = requestAnimationFrame((n) => void tick(n));
  }

  protected manual(): void {
    if (this.typed().trim()) this.open(this.typed());
  }

  /** Abre la etiqueta si el texto es de SiloPro; devuelve si la reconoció. */
  private open(text: string): boolean {
    const ref = decodeQrReference(text);
    if (!ref) {
      this.notRecognized.set(text.slice(0, 80));
      return false;
    }
    this.stop();
    void this.router.navigate(['/q', LETTER[ref.type], ref.code]);
    return true;
  }

  private fail(state: State, message: string): void {
    this.state.set(state);
    this.message.set(message);
  }

  private stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
