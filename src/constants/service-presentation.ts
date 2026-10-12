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

/** Unknown, stale, UUID, and demo identifiers intentionally have no artwork. */
export function getServicePresentation(
  serviceCode: unknown,
): ServicePresentation | null {
  if (typeof serviceCode !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(presentations, serviceCode)) return null;
  return presentations[serviceCode as ServicePresentationCode];
}
