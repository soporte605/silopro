import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'es-theme';

/** Preferencia de tema persistida localmente; `system` respeta el sistema operativo. */
@Injectable({ providedIn: 'root' })
export class EsThemeService {
  private readonly doc = inject(DOCUMENT);
  readonly preference = signal<ThemePreference>(this.read());

  constructor() {
    effect(() => {
      const pref = this.preference();
      const root = this.doc.documentElement;
      if (pref === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', pref);
      try {
        this.doc.defaultView?.localStorage.setItem(KEY, pref);
      } catch {
        /* almacenamiento no disponible: la preferencia vive solo en memoria */
      }
    });
  }

  cycle(): void {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    this.preference.update((p) => order[(order.indexOf(p) + 1) % order.length]!);
  }

  private read(): ThemePreference {
    try {
      const v = this.doc.defaultView?.localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }
}
