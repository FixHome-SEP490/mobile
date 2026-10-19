import type { ImageSourcePropType } from 'react-native';

interface ServicePresentation {
  assetFileName: string;
  imageSource: ImageSourcePropType;
}

/** Approved service artwork is resolved only by the Backend's stable service code. */
const presentations = {
  LAP_QUAT_DEN: {
    assetFileName: 'svc-lap-quat-den.png',
    imageSource: require('../../assets/optimized/services/svc-lap-quat-den.png'),
  },
  THAY_THIET_BI_VE_SINH: {
    assetFileName: 'svc-thay-thiet-bi-ve-sinh.png',
    imageSource: require('../../assets/optimized/services/svc-thay-thiet-bi-ve-sinh.png'),
  },
  VE_SINH_DIEU_HOA: {
    assetFileName: 'svc-ve-sinh-dieu-hoa.png',
    imageSource: require('../../assets/optimized/services/svc-ve-sinh-dieu-hoa.png'),
  },
  SUA_MAY_HUT_MUI: {
    assetFileName: 'svc-sua-may-hut-mui.png',
    imageSource: require('../../assets/optimized/services/svc-sua-may-hut-mui.png'),
  },
  VE_SINH_DIEU_HOA_1HP: {
    assetFileName: 'svc-ve-sinh-dieu-hoa-1hp.png',
    imageSource: require('../../assets/optimized/services/svc-ve-sinh-dieu-hoa-1hp.png'),
  },
  VE_SINH_DIEU_HOA_2HP: {
    assetFileName: 'svc-ve-sinh-dieu-hoa-2hp.png',
    imageSource: require('../../assets/optimized/services/svc-ve-sinh-dieu-hoa-2hp.png'),
  },
  VE_SINH_DIEU_HOA_AM_TRAN: {
    assetFileName: 'svc-ve-sinh-dieu-hoa-am-tran.png',
    imageSource: require('../../assets/optimized/services/svc-ve-sinh-dieu-hoa-am-tran.png'),
  },
  VE_SINH_MAY_GIAT_CUA_TREN_LE9: {
    assetFileName: 'svc-ve-sinh-may-giat-cua-tren-le9.png',
    imageSource: require('../../assets/optimized/services/svc-ve-sinh-may-giat-cua-tren-le9.png'),
  },
  VE_SINH_MAY_GIAT_CUA_TREN_GT9: {
    assetFileName: 'svc-ve-sinh-may-giat-cua-tren-gt9.png',
    imageSource: require('../../assets/optimized/services/svc-ve-sinh-may-giat-cua-tren-gt9.png'),
  },
  VE_SINH_MAY_GIAT_CUA_NGANG_LE9: {
    assetFileName: 'svc-ve-sinh-may-giat-cua-ngang-le9.png',
    imageSource: require('../../assets/optimized/services/svc-ve-sinh-may-giat-cua-ngang-le9.png'),
  },
  VE_SINH_MAY_GIAT_CUA_NGANG_GT9: {
    assetFileName: 'svc-ve-sinh-may-giat-cua-ngang-gt9.png',
    imageSource: require('../../assets/optimized/services/svc-ve-sinh-may-giat-cua-ngang-gt9.png'),
  },
  VE_SINH_MAY_SAY: {
    assetFileName: 'svc-ve-sinh-may-say.png',
    imageSource: require('../../assets/optimized/services/svc-ve-sinh-may-say.png'),
  },
  KIEM_TRA_CHAN_DOAN_THIET_BI: {
    assetFileName: 'svc-kiem-tra-chan-doan-thiet-bi.png',
    imageSource: require('../../assets/optimized/services/svc-kiem-tra-chan-doan-thiet-bi.png'),
  },
  SUA_DIEU_HOA: {
    assetFileName: 'svc-sua-dieu-hoa.png',
    imageSource: require('../../assets/optimized/services/svc-sua-dieu-hoa.png'),
  },
  SUA_TU_LANH: {
    assetFileName: 'svc-sua-tu-lanh.png',
    imageSource: require('../../assets/optimized/services/svc-sua-tu-lanh.png'),
  },
  SUA_MAY_GIAT: {
    assetFileName: 'svc-sua-may-giat.png',
    imageSource: require('../../assets/optimized/services/svc-sua-may-giat.png'),
  },
  VE_SINH_BINH_NONG_LANH: {
    assetFileName: 'svc-ve-sinh-binh-nong-lanh.png',
    imageSource: require('../../assets/optimized/services/svc-ve-sinh-binh-nong-lanh.png'),
  },
  THAY_CONG_TAC_DIEN: {
    assetFileName: 'svc-thay-cong-tac-dien.png',
    imageSource: require('../../assets/optimized/services/svc-thay-cong-tac-dien.png'),
  },
  THAY_O_CAM_DIEN: {
    assetFileName: 'svc-thay-o-cam-dien.png',
    imageSource: require('../../assets/optimized/services/svc-thay-o-cam-dien.png'),
  },
  LAP_DEN_TRAN_CO_BAN: {
    assetFileName: 'svc-lap-den-tran-co-ban.png',
    imageSource: require('../../assets/optimized/services/svc-lap-den-tran-co-ban.png'),
  },
  LAP_QUAT_TREO_TUONG: {
    assetFileName: 'svc-lap-quat-treo-tuong.png',
    imageSource: require('../../assets/optimized/services/svc-lap-quat-treo-tuong.png'),
  },
  LAP_QUAT_TRAN_CO_BAN: {
    assetFileName: 'svc-lap-quat-tran-co-ban.png',
    imageSource: require('../../assets/optimized/services/svc-lap-quat-tran-co-ban.png'),
  },
  LAP_TV_GIA_TREO: {
    assetFileName: 'svc-lap-tv-gia-treo.png',
    imageSource: require('../../assets/optimized/services/svc-lap-tv-gia-treo.png'),
  },
  THAY_VOI_NUOC: {
    assetFileName: 'svc-thay-voi-nuoc.png',
    imageSource: require('../../assets/optimized/services/svc-thay-voi-nuoc.png'),
  },
  THAY_VOI_SEN: {
    assetFileName: 'svc-thay-voi-sen.png',
    imageSource: require('../../assets/optimized/services/svc-thay-voi-sen.png'),
  },
  THAY_SIPHON_LAVABO: {
    assetFileName: 'svc-thay-siphon-lavabo.png',
    imageSource: require('../../assets/optimized/services/svc-thay-siphon-lavabo.png'),
  },
  SUA_CHAP_DIEN: {
    assetFileName: 'svc-sua-chap-dien.png',
    imageSource: require('../../assets/optimized/services/svc-sua-chap-dien.png'),
  },
  SUA_RO_RI_NUOC: {
    assetFileName: 'svc-sua-ro-ri-nuoc.png',
    imageSource: require('../../assets/optimized/services/svc-sua-ro-ri-nuoc.png'),
  },
  LAP_MAY_LOC_NUOC: {
    assetFileName: 'svc-lap-may-loc-nuoc.png',
    imageSource: require('../../assets/optimized/services/svc-lap-may-loc-nuoc.png'),
  },
  SUA_BEP_TU: {
    assetFileName: 'svc-sua-bep-tu.png',
    imageSource: require('../../assets/optimized/services/svc-sua-bep-tu.png'),
  },
  SUA_MAY_RUA_CHEN: {
    assetFileName: 'svc-sua-may-rua-chen.png',
    imageSource: require('../../assets/optimized/services/svc-sua-may-rua-chen.png'),
  },
  SUA_KHOA_THONG_MINH: {
    assetFileName: 'svc-sua-khoa-thong-minh.png',
    imageSource: require('../../assets/optimized/services/svc-sua-khoa-thong-minh.png'),
  },
  MO_KHOA_KHAN_CAP: {
    assetFileName: 'svc-mo-khoa-khan-cap.png',
    imageSource: require('../../assets/optimized/services/svc-mo-khoa-khan-cap.png'),
  },
  DICH_VU_KHAC: {
    assetFileName: 'svc-dich-vu-khac.png',
    imageSource: require('../../assets/optimized/services/svc-dich-vu-khac.png'),
  },
} as const satisfies Record<string, ServicePresentation>;

export type ServicePresentationCode = keyof typeof presentations;

export const SERVICE_PRESENTATION_CODES = Object.freeze(
  Object.keys(presentations) as ServicePresentationCode[],
);

/**
 * Artwork drawn for Catalog V2 services that had no close older picture (19/10/2026), in the same style:
 * 3D-rendered technician in blue cap, overalls and gloves, white and steel appliances, transparent 512 px PNG.
 */
const v2Presentations: Readonly<Record<string, ServicePresentation>> = {
  'AC-03': {
    assetFileName: 'svc-lap-dat-dieu-hoa.png',
    imageSource: require('../../assets/optimized/services/svc-lap-dat-dieu-hoa.png'),
  },
  'AC-04': {
    assetFileName: 'svc-thao-di-doi-dieu-hoa.png',
    imageSource: require('../../assets/optimized/services/svc-thao-di-doi-dieu-hoa.png'),
  },
  'PU-01': {
    assetFileName: 'svc-sua-may-bom-nuoc.png',
    imageSource: require('../../assets/optimized/services/svc-sua-may-bom-nuoc.png'),
  },
  'PU-02': {
    assetFileName: 'svc-lap-dat-may-bom-nuoc.png',
    imageSource: require('../../assets/optimized/services/svc-lap-dat-may-bom-nuoc.png'),
  },
};

/**
 * Catalog V2 codes (19/10/2026: `AC-02`, `WM-01`...) borrow the owner-approved artwork of the closest
 * older service. The last block borrows a picture of the same appliance only until its own is drawn.
 */
const V2_ARTWORK: Readonly<Record<string, ServicePresentationCode>> = {
  // Same appliance, still waiting for its own picture (washer install, dryer, purifier, fan, drain).
  'WM-02': 'VE_SINH_MAY_GIAT_CUA_NGANG_LE9',
  'WM-03': 'SUA_MAY_GIAT',
  'WM-04': 'VE_SINH_MAY_SAY',
  'WH-02': 'VE_SINH_BINH_NONG_LANH',
  'KT-02': 'SUA_MAY_HUT_MUI',
  'RO-01': 'LAP_MAY_LOC_NUOC',
  'RO-02': 'LAP_MAY_LOC_NUOC',
  'LF-03': 'LAP_QUAT_TREO_TUONG',
  'SA-03': 'THAY_SIPHON_LAVABO',
  'AC-01': 'SUA_DIEU_HOA',
  'AC-02': 'VE_SINH_DIEU_HOA',
  'WM-01': 'SUA_MAY_GIAT',
  'WM-05': 'VE_SINH_MAY_SAY',
  'FR-01': 'SUA_TU_LANH',
  'KT-01': 'SUA_BEP_TU',
  'KT-03': 'SUA_MAY_HUT_MUI',
  'WH-01': 'VE_SINH_BINH_NONG_LANH',
  'PI-01': 'SUA_RO_RI_NUOC',
  'TV-01': 'LAP_TV_GIA_TREO',
  'LF-01': 'LAP_DEN_TRAN_CO_BAN',
  'LF-02': 'LAP_QUAT_TRAN_CO_BAN',
  'SA-01': 'THAY_THIET_BI_VE_SINH',
  'SA-02': 'THAY_THIET_BI_VE_SINH',
  'EL-01': 'SUA_CHAP_DIEN',
  'EL-02': 'THAY_CONG_TAC_DIEN',
  'RO-03': 'LAP_MAY_LOC_NUOC',
  'LK-02': 'SUA_KHOA_THONG_MINH',
  'LK-03': 'SUA_KHOA_THONG_MINH',
};

/** Unknown, stale, UUID, and demo identifiers intentionally have no artwork. */
export function getServicePresentation(
  serviceCode: unknown,
): ServicePresentation | null {
  if (typeof serviceCode !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(v2Presentations, serviceCode)) return v2Presentations[serviceCode];
  const code = Object.prototype.hasOwnProperty.call(V2_ARTWORK, serviceCode) ? V2_ARTWORK[serviceCode] : serviceCode;
  if (!Object.prototype.hasOwnProperty.call(presentations, code)) return null;
  return presentations[code as ServicePresentationCode];
}
