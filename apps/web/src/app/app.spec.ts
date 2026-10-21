import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Category } from '@silopro/contracts';
import { attributeChain, categoryTree } from './core/categories';
import { SessionService } from './core/session';
import { Shell } from './layout/shell';
import { safeReturnUrl } from './pages/auth/auth-layout';
import { slugKey } from './pages/categories/category-form';

describe('Shell', () => {
  it('muestra la navegación y la organización activa', async () => {
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
    TestBed.inject(SessionService).me.set({
      user: { id: 'u1', email: 'ana@ejemplo.test', name: 'Ana López' },
      memberships: [{ organizationId: 'o1', organizationName: 'Taller Norte', role: 'operator' }],
    });
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('nav[aria-label="Principal"]')?.textContent).toContain('Artículos');
    expect(el.textContent).toContain('Taller Norte');
    expect(el.textContent).toContain('Operador');
    expect(el.textContent).toContain('AL');
  });
});

describe('SessionService', () => {
  it('aplica la matriz de permisos del dominio', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const s = TestBed.inject(SessionService);
    s.me.set({
      user: { id: 'u', email: 'a@b.c', name: 'A' },
      memberships: [{ organizationId: 'o', organizationName: 'O', role: 'operator' }],
    });
    expect(s.canMove()).toBe(true);
    expect(s.canWrite()).toBe(false);
    expect(s.canAdjust()).toBe(false);
  });
});

describe('utilidades', () => {
  it('safeReturnUrl solo acepta rutas internas', () => {
    expect(safeReturnUrl('/inventario?q=1')).toBe('/inventario?q=1');
    expect(safeReturnUrl('//malicioso.example')).toBe('/');
    expect(safeReturnUrl('https://malicioso.example')).toBe('/');
    expect(safeReturnUrl(undefined)).toBe('/');
  });

  it('slugKey genera claves de atributo válidas', () => {
    expect(slugKey('Voltaje máx.')).toBe('voltaje_max');
    expect(slugKey('Potencia (W)')).toBe('potencia_w');
    expect(slugKey('12 V')).toBe('a_12_v');
    expect(slugKey('   ')).toBe('');
  });

  it('categoryTree ordena por jerarquía y attributeChain va de raíz a hoja', () => {
    const cat = (id: string, name: string, parentId: string | null, key: string): Category => ({
      id,
      name,
      parentId,
      description: null,
      attributes: [{ key, label: key, type: 'text' }],
      itemCount: 0,
      version: 1,
    });
    const list = [
      cat('c', 'Resistencias', 'a', 'valor'),
      cat('a', 'Electrónica', null, 'marca'),
      cat('b', 'Cables', null, 'calibre'),
    ];
    expect(categoryTree(list).map((o) => [o.id, o.depth])).toEqual([
      ['b', 0],
      ['a', 0],
      ['c', 1],
    ]);
    expect(attributeChain(list, 'c').map((defs) => defs[0]?.key)).toEqual(['marca', 'valor']);
  });
});
