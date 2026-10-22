import { cabinetSceneModel, createGridLayout } from '@silopro/cabinet-engine';
import { Raycaster, Vector3 } from 'three';
import { CabinetScene, type ScenePalette } from './cabinet-scene';

const palette: ScenePalette = {
  frame: '#999999',
  empty: '#eeeeee',
  stocked: '#22aa55',
  low: '#ffaa00',
  full: '#3366ff',
  selection: '#111111',
};

/** Rayo recto desde delante hacia el centro del frente de un cajón. */
function rayAt(scene: CabinetScene, id: string): Raycaster {
  const f = scene.frontOf(id)!;
  return new Raycaster(new Vector3(f.x, f.y, 1000), new Vector3(0, 0, -1));
}

describe('CabinetScene', () => {
  const model = cabinetSceneModel(createGridLayout({ rows: 2, columns: 3 }));

  it('elige el cajón que toca el rayo', () => {
    const s = new CabinetScene(model, palette);
    expect(s.pick(rayAt(s, 'A1'))).toBe('A1');
    expect(s.pick(rayAt(s, 'B3'))).toBe('B3');
    const miss = new Raycaster(new Vector3(500, 500, 1000), new Vector3(0, 0, -1));
    expect(s.pick(miss)).toBeNull();
    s.dispose();
  });

  it('abre el cajón elegido con animación y lo cierra al alternar', () => {
    const s = new CabinetScene(model, palette);
    s.setSelected('B2');
    expect(s.isOpen('B2')).toBe(true);
    expect(s.step(0.1)).toBe(true);
    for (let i = 0; i < 20; i++) s.step(0.05);
    expect(s.step(0.05)).toBe(false);
    // Abierto, el frente avanzó: un rayo lateral a la altura del cajón lo toca fuera del gabinete.
    const f = s.frontOf('B2')!;
    const side = new Raycaster(
      new Vector3(-1000, f.y, f.z + model.drawers[0]!.travel / 2),
      new Vector3(1, 0, 0),
    );
    expect(s.pick(side)).toBe('B2');

    s.toggleSelected();
    expect(s.isOpen('B2')).toBe(false);
    s.setSelected('A1', false);
    expect(s.isOpen('A1')).toBe(false);
    s.dispose();
  });
});
