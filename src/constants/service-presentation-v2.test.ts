import { getServicePresentation } from './service-presentation';

type TestFs = { readFileSync(path: string): Uint8Array };
const fs = jest.requireActual<TestFs>('fs');

// Every service code of the live Catalog V2 (`GET /services` on 19/10/2026).
const LIVE_V2_CODES = [
  'AC-01', 'AC-02', 'AC-03', 'AC-04', 'WM-01', 'WM-02', 'WM-03', 'WM-04', 'WM-05', 'FR-01', 'RO-01', 'RO-02', 'RO-03',
  'WH-01', 'WH-02', 'KT-01', 'KT-02', 'KT-03', 'EL-01', 'EL-02', 'LF-01', 'LF-02', 'LF-03', 'PI-01', 'PU-01', 'PU-02',
  'SA-01', 'SA-02', 'SA-03', 'TV-01', 'LK-02', 'LK-03',
];
const DRAWN_FOR_V2 = ['svc-lap-dat-dieu-hoa', 'svc-thao-di-doi-dieu-hoa', 'svc-sua-may-bom-nuoc', 'svc-lap-dat-may-bom-nuoc'];

describe('artwork for Catalog V2 services', () => {
  it('gives every live V2 service a picture, never the neutral fallback', () => {
    for (const code of LIVE_V2_CODES) {
      expect({ code, art: getServicePresentation(code)?.assetFileName }).toEqual({ code, art: expect.stringMatching(/^svc-.*\.png$/) });
    }
  });

  it('uses the pictures drawn for the services that had no older equivalent', () => {
    expect(['AC-03', 'AC-04', 'PU-01', 'PU-02'].map((c) => getServicePresentation(c)?.assetFileName))
      .toEqual(DRAWN_FOR_V2.map((n) => `${n}.png`));
  });

  it('ships those pictures like the older ones: RGBA PNG, transparent corners, at most 512 px', () => {
    for (const name of DRAWN_FOR_V2) {
      const png = fs.readFileSync(`assets/optimized/services/${name}.png`);
      expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(png[25]).toBe(6); // colour type 6 = RGBA
      const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
      expect(Math.max(view.getUint32(16), view.getUint32(20))).toBeLessThanOrEqual(512);
    }
  });

  it('keeps unknown codes without artwork', () => {
    expect(getServicePresentation('ZZ-99')).toBeNull();
  });
});
