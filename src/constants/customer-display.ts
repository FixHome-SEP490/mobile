const CUSTOMER_SERVICE_DISPLAY_NAMES: Record<string, string> = {
  KIEM_TRA_CHAN_DOAN_THIET_BI: 'Kiểm tra/chẩn đoán tại nhà',
  LAP_QUAT_DEN: 'Lắp quạt trần, đèn, ổ cắm',
  THAY_THIET_BI_VE_SINH: 'Lắp/thay vòi sen, lavabo, bồn cầu',
  LAP_DEN_TRAN_CO_BAN: 'Lắp đèn trần',
  LAP_MAY_LOC_NUOC: 'Lắp máy lọc nước',
  LAP_QUAT_TRAN_CO_BAN: 'Lắp quạt trần',
  LAP_QUAT_TREO_TUONG: 'Lắp quạt treo tường',
  LAP_TV_GIA_TREO: 'Lắp TV lên giá treo sẵn',
  MO_KHOA_KHAN_CAP: 'Mở khóa khẩn cấp 24/7',
  SUA_BEP_TU: 'Sửa bếp từ',
  SUA_CHAP_DIEN: 'Sửa chập điện',
  SUA_DIEU_HOA: 'Sửa điều hòa',
  SUA_KHOA_THONG_MINH: 'Sửa khóa thông minh',
  SUA_MAY_GIAT: 'Sửa máy giặt',
  SUA_MAY_RUA_CHEN: 'Sửa máy rửa bát',
  SUA_RO_RI_NUOC: 'Sửa rò rỉ nước',
  SUA_TU_LANH: 'Sửa tủ lạnh',
  THAY_CONG_TAC_DIEN: 'Thay công tắc',
  THAY_O_CAM_DIEN: 'Thay ổ cắm',
  THAY_SIPHON_LAVABO: 'Thay siphon lavabo',
  THAY_VOI_NUOC: 'Thay vòi nước',
  THAY_VOI_SEN: 'Thay vòi sen',
  VE_SINH_DIEU_HOA: 'Vệ sinh, nạp gas điều hòa',
  SUA_MAY_HUT_MUI: 'Vệ sinh/sửa motor hút mùi',
  VE_SINH_MAY_GIAT_CUA_NGANG_GT9: 'Vệ sinh máy giặt ngang > 9 kg',
  VE_SINH_MAY_GIAT_CUA_NGANG_LE9: 'Vệ sinh máy giặt ngang ≤ 9 kg',
  VE_SINH_MAY_GIAT_CUA_TREN_GT9: 'Vệ sinh máy giặt đứng > 9 kg',
  VE_SINH_MAY_GIAT_CUA_TREN_LE9: 'Vệ sinh máy giặt đứng ≤ 9 kg',
  VE_SINH_DIEU_HOA_AM_TRAN: 'Vệ sinh điều hòa âm trần',
  VE_SINH_DIEU_HOA_1HP: 'Vệ sinh điều hòa 1–1,5 HP',
  VE_SINH_DIEU_HOA_2HP: 'Vệ sinh điều hòa 2–2,5 HP',
  VE_SINH_MAY_SAY: 'Vệ sinh máy sấy',
  VE_SINH_BINH_NONG_LANH: 'Vệ sinh bình nóng lạnh',
};

/** Shortens catalog names for visible Customer UI only; callers retain canonical data. */
export function displayCustomerServiceName(code: string | undefined, sourceName: string): string {
  return (code ? CUSTOMER_SERVICE_DISPLAY_NAMES[code] : undefined) ?? sourceName;
}

/** Keep two columns where width or text scaling would make three cramped. */
export function customerDiscoveryColumns(width: number, fontScale: number): 2 | 3 {
  return width < 380 || fontScale >= 1.15 ? 2 : 3;
}
