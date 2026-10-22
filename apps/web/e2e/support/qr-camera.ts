// Video Y4M de un solo cuadro con un QR, para la cámara falsa de Chromium en
// las pruebas del escáner (--use-file-for-fake-video-capture).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { encode } from 'uqr';

/** Contenido del QR de prueba: una ubicación con un código que no existe. */
export const FAKE_CAMERA_QR = 'https://silopro.test/q/u/QRPRZEBA01';

export function writeQrCamera(path: string, text = FAKE_CAMERA_QR): void {
  const W = 640;
  const H = 480;
  const { size, data } = encode(text, { ecc: 'M', border: 4 });
  const scale = Math.floor(Math.min(W, H) / size);
  const x0 = Math.floor((W - size * scale) / 2);
  const y0 = Math.floor((H - size * scale) / 2);
  const y = Buffer.alloc(W * H, 235);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (data[r]![c])
        for (let dy = 0; dy < scale; dy++)
          y.fill(
            16,
            (y0 + r * scale + dy) * W + x0 + c * scale,
            (y0 + r * scale + dy) * W + x0 + (c + 1) * scale,
          );
  const uv = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\nFRAME\n`), y, uv]),
  );
}
