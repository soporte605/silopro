import {
  type HttpErrorResponse,
  HttpClient,
  type HttpInterceptorFn,
  HttpParams,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ApiError } from '@silopro/contracts';
import { firstValueFrom } from 'rxjs';
import { SessionService } from './session';

/**
 * Añade la cabecera anti-CSRF y envía cookies en todas las peticiones a la API.
 * Ver apps/api/src/common/csrf.guard.ts.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  return next(req.clone({ withCredentials: true, setHeaders: { 'X-SiloPro-Request': '1' } }));
};

/** Error de la API con mensaje legible y detalles de validación. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  static from(e: unknown): ApiRequestError {
    if (e instanceof ApiRequestError) return e;
    const err = e as HttpErrorResponse;
    const body = err?.error as Partial<ApiError> | undefined;
    if (body && typeof body === 'object' && typeof body.message === 'string') {
      return new ApiRequestError(err.status, body.code ?? 'ERROR', body.message, body.details);
    }
    if (err?.status === 0)
      return new ApiRequestError(0, 'OFFLINE', 'No se pudo conectar con el servidor');
    return new ApiRequestError(err?.status ?? 500, 'ERROR', 'Error inesperado');
  }

  /** Mensajes por campo (validación zod o atributos de dominio). */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as { path?: string; key?: string; message: string }[]) {
        const k = d.path ?? d.key;
        if (k && !out[k]) out[k] = d.message;
      }
    }
    return out;
  }
}

/** Cliente de la API con rutas relativas a la organización activa. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);

  private url(path: string): string {
    if (path.startsWith('/api/')) return path;
    const org = this.session.orgId();
    if (!org) throw new ApiRequestError(400, 'NO_ORG', 'No hay organización activa');
    return `/api/orgs/${org}${path}`;
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params ?? {}))
      if (v !== undefined && v !== '') p = p.set(k, String(v));
    return this.wrap(firstValueFrom(this.http.get<T>(this.url(path), { params: p })));
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.wrap(firstValueFrom(this.http.post<T>(this.url(path), body)));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.wrap(firstValueFrom(this.http.patch<T>(this.url(path), body)));
  }

  delete(path: string): Promise<void> {
    return this.wrap(firstValueFrom(this.http.delete<void>(this.url(path))));
  }

  private async wrap<T>(p: Promise<T>): Promise<T> {
    try {
      return await p;
    } catch (e) {
      throw ApiRequestError.from(e);
    }
  }
}
