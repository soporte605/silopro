import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EsButton } from '@elikarsystems/ui';
import { filterCommands, normalizeSearch, type EsCommand } from '@elikarsystems/ui';
import { EsTab, EsTabs } from '@elikarsystems/ui';
import { EsSwitch } from '@elikarsystems/ui';

describe('normalizeSearch / filterCommands', () => {
  const cmds: EsCommand[] = [
    { id: '1', label: 'Nueva ubicación', group: 'Ubicaciones', run: () => {} },
    { id: '2', label: 'Nuevo artículo', keywords: ['componente'], run: () => {} },
  ];

  it('ignora acentos y mayúsculas', () => {
    expect(normalizeSearch('UBICACIÓN')).toBe('ubicacion');
    expect(filterCommands(cmds, 'ubicacion').map((c) => c.id)).toEqual(['1']);
  });

  it('exige todos los términos y busca en sinónimos', () => {
    expect(filterCommands(cmds, 'nuevo componente').map((c) => c.id)).toEqual(['2']);
    expect(filterCommands(cmds, '')).toHaveLength(2);
    expect(filterCommands(cmds, 'zzz')).toHaveLength(0);
  });
});

@Component({
  imports: [EsButton, EsTabs, EsTab, EsSwitch],
  template: `
    <button esButton variant="primary" size="sm" [loading]="true">Guardar</button>
    <es-tabs label="Prueba">
      <es-tab value="a" label="A">Panel A</es-tab>
      <es-tab value="b" label="B">Panel B</es-tab>
      <es-tab value="c" label="C">Panel C</es-tab>
    </es-tabs>
    <button esSwitch [(checked)]="on" aria-label="Interruptor"></button>
  `,
})
class Host {
  on = signal(false);
}

describe('componentes', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture;
  }

  it('Button aplica variante, tamaño y aria-busy', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    const btn = el.querySelector('button[esButton]')!;
    expect(btn.getAttribute('data-variant')).toBe('primary');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.className).toContain('h-6');
  });

  it('Tabs sigue el patrón ARIA y navega con flechas', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('[role=tab]'));
    expect(tabs).toHaveLength(3);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]!.tabIndex).toBe(-1);
    expect(el.textContent).toContain('Panel A');

    el.querySelector('[role=tablist]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    await fixture.whenStable();
    expect(tabs[2]!.getAttribute('aria-selected')).toBe('true');
    expect(el.textContent).toContain('Panel C');
    expect(el.textContent).not.toContain('Panel A');
  });

  it('Switch expone role=switch y alterna aria-checked', async () => {
    const fixture = await render();
    const sw = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[role=switch]',
    )!;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    await fixture.whenStable();
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(fixture.componentInstance.on()).toBe(true);
  });
});
