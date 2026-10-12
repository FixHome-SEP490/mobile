import { CUSTOMER_UI_ARTWORK } from './customer-artwork';
import {
  getServicePresentation,
  SERVICE_PRESENTATION_CODES,
} from './service-presentation';

type TestFs = {
  readFileSync: {
    (path: string): Uint8Array;
    (path: string, encoding: string): string;
  };
};

// Repo-relative paths (Jest runs from the repo root). Same assertions as
// before; only the file-reading mechanism changed so this suite typechecks
// without @types/node (tsconfig `types: ["jest"]` is untouched).
const fs = jest.requireActual<TestFs>('fs');

const EXPECTED_PRESENTATIONS = {
  LAP_QUAT_DEN: 'svc-lap-quat-den.png',
  THAY_THIET_BI_VE_SINH: 'svc-thay-thiet-bi-ve-sinh.png',
  VE_SINH_DIEU_HOA: 'svc-ve-sinh-dieu-hoa.png',
  SUA_MAY_HUT_MUI: 'svc-sua-may-hut-mui.png',
  VE_SINH_DIEU_HOA_1HP: 'svc-ve-sinh-dieu-hoa-1hp.png',
  VE_SINH_DIEU_HOA_2HP: 'svc-ve-sinh-dieu-hoa-2hp.png',
  VE_SINH_DIEU_HOA_AM_TRAN: 'svc-ve-sinh-dieu-hoa-am-tran.png',
  VE_SINH_MAY_GIAT_CUA_TREN_LE9: 'svc-ve-sinh-may-giat-cua-tren-le9.png',
  VE_SINH_MAY_GIAT_CUA_TREN_GT9: 'svc-ve-sinh-may-giat-cua-tren-gt9.png',
  VE_SINH_MAY_GIAT_CUA_NGANG_LE9: 'svc-ve-sinh-may-giat-cua-ngang-le9.png',
  VE_SINH_MAY_GIAT_CUA_NGANG_GT9: 'svc-ve-sinh-may-giat-cua-ngang-gt9.png',
  VE_SINH_MAY_SAY: 'svc-ve-sinh-may-say.png',
  KIEM_TRA_CHAN_DOAN_THIET_BI: 'svc-kiem-tra-chan-doan-thiet-bi.png',
  SUA_DIEU_HOA: 'svc-sua-dieu-hoa.png',
  SUA_TU_LANH: 'svc-sua-tu-lanh.png',
  SUA_MAY_GIAT: 'svc-sua-may-giat.png',
  VE_SINH_BINH_NONG_LANH: 'svc-ve-sinh-binh-nong-lanh.png',
  THAY_CONG_TAC_DIEN: 'svc-thay-cong-tac-dien.png',
  THAY_O_CAM_DIEN: 'svc-thay-o-cam-dien.png',
  LAP_DEN_TRAN_CO_BAN: 'svc-lap-den-tran-co-ban.png',
  LAP_QUAT_TREO_TUONG: 'svc-lap-quat-treo-tuong.png',
  LAP_QUAT_TRAN_CO_BAN: 'svc-lap-quat-tran-co-ban.png',
  LAP_TV_GIA_TREO: 'svc-lap-tv-gia-treo.png',
  THAY_VOI_NUOC: 'svc-thay-voi-nuoc.png',
  THAY_VOI_SEN: 'svc-thay-voi-sen.png',
  THAY_SIPHON_LAVABO: 'svc-thay-siphon-lavabo.png',
  SUA_CHAP_DIEN: 'svc-sua-chap-dien.png',
  SUA_RO_RI_NUOC: 'svc-sua-ro-ri-nuoc.png',
  LAP_MAY_LOC_NUOC: 'svc-lap-may-loc-nuoc.png',
  SUA_BEP_TU: 'svc-sua-bep-tu.png',
  SUA_MAY_RUA_CHEN: 'svc-sua-may-rua-chen.png',
  SUA_KHOA_THONG_MINH: 'svc-sua-khoa-thong-minh.png',
  MO_KHOA_KHAN_CAP: 'svc-mo-khoa-khan-cap.png',
  DICH_VU_KHAC: 'svc-dich-vu-khac.png',
} as const;

describe('service presentation map', () => {
  it('bundles all ten team-owned optimized UI illustrations with alpha', () => {
    const source = fs.readFileSync('src/constants/customer-artwork.ts', 'utf8');
    const paths = [...source.matchAll(/require\('\.\.\/\.\.\/assets\/optimized\/ui\/([^']+)'\)/g)].map((match) => match[1]);
    expect(paths).toHaveLength(10);
    expect(new Set(paths).size).toBe(10);
    expect(Object.keys(CUSTOMER_UI_ARTWORK)).toHaveLength(10);
    // Generated full-resolution originals are preserved outside Git and are not CI dependencies.
    for (const filename of paths) {
      const png = fs.readFileSync(`assets/optimized/ui/${filename}`);
      expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(png[25]).toBe(6);
    }
  });
  it('maps all 34 live-catalog canonical service codes to their owner-approved image files', () => {
    const expectedCodes = Object.keys(EXPECTED_PRESENTATIONS).sort();
    expect(SERVICE_PRESENTATION_CODES.slice().sort()).toEqual(expectedCodes);

    for (const [code, assetFileName] of Object.entries(EXPECTED_PRESENTATIONS)) {
      expect(getServicePresentation(code)).toMatchObject({
        assetFileName,
        imageSource: expect.anything(),
      });
    }
  });

  it('bundles an existing optimized RGBA PNG for every canonical code through a static require', () => {
    const source = fs.readFileSync('src/constants/service-presentation.ts', 'utf8');
    for (const [code, filename] of Object.entries(EXPECTED_PRESENTATIONS)) {
      const entry = source.match(new RegExp(`${code}: \\{([\\s\\S]*?)\\n  \\}`))?.[1];
      expect(entry).toContain(`require('../../assets/optimized/services/${filename}')`);
      const png = fs.readFileSync(`assets/optimized/services/${filename}`);
      expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(png[25]).toBe(6);
      const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
      expect(Math.max(view.getUint32(16), view.getUint32(20))).toBeLessThanOrEqual(512);
    }
  });

  it('returns no service image for unknown codes, UUIDs, or demo identifiers', () => {
    for (const code of [
      null,
      undefined,
      'UNKNOWN_SERVICE',
      '11111111-1111-4111-8111-111111111111',
      'ac_clean',
      'plumbing',
      '__proto__',
      'constructor',
    ]) {
      expect(getServicePresentation(code)).toBeNull();
    }
  });
});
