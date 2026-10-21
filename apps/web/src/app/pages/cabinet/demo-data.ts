/**
 * Datos ficticios para la demostración del gabinete. Se sustituirán por el
 * inventario real en las fases 2 y 3. Generador determinista por posición
 * para que la demo sea reproducible.
 */
export interface DemoStock {
  item: string;
  sku: string;
  quantity: number;
  minimum: number;
}

const ITEMS: [string, string][] = [
  ['ESP32-S3-WROOM-1', 'MCU-ESP32S3'],
  ['Resistencia 10 kΩ 1/4 W', 'RES-10K'],
  ['Resistencia 220 Ω 1/4 W', 'RES-220'],
  ['Capacitor cerámico 100 nF', 'CAP-100N'],
  ['LED rojo 5 mm', 'LED-R5'],
  ['Sensor BME280', 'SEN-BME280'],
  ['Pantalla OLED 0.96" I²C', 'DSP-OLED096'],
  ['Conector JST-XH 2 pines', 'CON-JSTXH2'],
  ['Tornillo M3×10', 'TOR-M3X10'],
  ['Tuerca M3', 'TUE-M3'],
  ['Regulador AMS1117-3.3', 'REG-AMS1117'],
  ['Transistor 2N2222', 'TRN-2N2222'],
  ['Diodo 1N4007', 'DIO-1N4007'],
  ['Fusible 5×20 1 A', 'FUS-520-1A'],
  ['Relevador 5 V', 'REL-5V'],
  ['Arduino Nano', 'MCU-NANO'],
];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoStock(addresses: readonly string[], seed = 7): Map<string, DemoStock> {
  const map = new Map<string, DemoStock>();
  for (const address of addresses) {
    // Semilla por posición: fusionar o dividir no altera el resto del gabinete.
    const rand = mulberry32(hash(address) ^ seed);
    if (rand() < 0.35) continue; // vacío
    const [item, sku] = ITEMS[Math.floor(rand() * ITEMS.length)]!;
    const minimum = 5 + Math.floor(rand() * 10);
    const quantity = Math.floor(rand() * 60);
    map.set(address, { item, sku, quantity, minimum });
  }
  return map;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
