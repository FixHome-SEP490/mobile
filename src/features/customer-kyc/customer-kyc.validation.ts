import type {
  CustomerKycDocumentType,
  CustomerKycGender,
  CustomerKycMimeType,
} from '../../api/customer-verification.api';

export type { CustomerKycDocumentType, CustomerKycGender, CustomerKycMimeType };

export interface CustomerKycFormValues {
  fullName: string;
  dateOfBirth: string;
  gender: CustomerKycGender | '';
  citizenIdNumber: string;
  address: string;
}

export type CustomerKycFormErrors = Partial<Record<keyof CustomerKycFormValues, string>>;

export interface VnCalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface UploadedCustomerKycDocument {
  documentType: CustomerKycDocumentType;
  storageObjectPath: string;
  fileName: string;
  fileSize: number;
  mimeType: CustomerKycMimeType;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const extensions: Record<CustomerKycMimeType, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

export function vnCalendarDate(date = new Date()): VnCalendarDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function validateVnDateOfBirth(value: string, today = vnCalendarDate()): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'Nhập ngày sinh theo định dạng YYYY-MM-DD.';
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return 'Ngày sinh không hợp lệ hoặc trước năm 1900.';
  }
  const age = today.year - year - (today.month < month || (today.month === month && today.day < day) ? 1 : 0);
  return age >= 18 ? null : 'Bạn phải đủ 18 tuổi theo ngày Việt Nam.';
}

export function validateCustomerKycForm(
  form: CustomerKycFormValues,
  today = vnCalendarDate(),
): CustomerKycFormErrors {
  const errors: CustomerKycFormErrors = {};
  const name = form.fullName.trim();
  const address = form.address.trim();
  if (name.length < 2 || name.length > 200) errors.fullName = 'Họ và tên cần từ 2 đến 200 ký tự.';
  const dateError = validateVnDateOfBirth(form.dateOfBirth, today);
  if (dateError) errors.dateOfBirth = dateError;
  if (!['MALE', 'FEMALE', 'OTHER'].includes(form.gender)) errors.gender = 'Chọn giới tính.';
  if (!/^\d{12}$/.test(form.citizenIdNumber)) errors.citizenIdNumber = 'Số CCCD phải gồm đúng 12 chữ số.';
  if (address.length < 5 || address.length > 500) errors.address = 'Địa chỉ cần từ 5 đến 500 ký tự.';
  return errors;
}

function fileExtension(value: string): string | null {
  const last = value.split(/[\\/]/).pop() ?? '';
  const match = /\.([a-z0-9]+)$/i.exec(last);
  return match?.[1].toLowerCase() ?? null;
}

export function inferCustomerKycMimeType(
  mimeType: string | null | undefined,
  uri: string,
): CustomerKycMimeType | null {
  const extension = fileExtension(uri.split(/[?#]/, 1)[0]);
  if (!extension) return null;
  const inferred: CustomerKycMimeType | null = ['jpg', 'jpeg'].includes(extension)
    ? 'image/jpeg'
    : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : null;
  if (!inferred) return null;
  if (mimeType == null || mimeType === '') return inferred;
  if (!Object.prototype.hasOwnProperty.call(extensions, mimeType)) return null;
  const declared = mimeType as CustomerKycMimeType;
  return extensions[declared].includes(extension) ? declared : null;
}

function validDocument(document: UploadedCustomerKycDocument, userId: string): boolean {
  const pathPrefix = `kyc/${userId}/`;
  const pathName = document.storageObjectPath.startsWith(pathPrefix)
    ? document.storageObjectPath.slice(pathPrefix.length)
    : '';
  const nameExtension = fileExtension(document.fileName);
  const pathExtension = fileExtension(pathName);
  const allowedExtensions = extensions[document.mimeType];
  return /^[A-Za-z0-9_-]{1,128}$/.test(userId)
    && /^[^\\/\u0000-\u001f]{1,255}$/.test(document.fileName)
    && !!nameExtension && allowedExtensions.includes(nameExtension)
    && /^[A-Za-z0-9_-]{1,128}\.(?:jpe?g|png|webp)$/i.test(pathName)
    && !!pathExtension && allowedExtensions.includes(pathExtension)
    && Number.isSafeInteger(document.fileSize) && document.fileSize >= 1 && document.fileSize <= MAX_FILE_SIZE;
}

export function validateCustomerKycDocuments(
  documents: readonly UploadedCustomerKycDocument[],
  userId: string,
): string | null {
  if (!userId || documents.length !== 2) return 'Cần tải đủ hai mặt CCCD.';
  const front = documents.filter(document => document.documentType === 'citizen_id_front');
  const back = documents.filter(document => document.documentType === 'citizen_id_back');
  if (front.length !== 1 || back.length !== 1) return 'Chọn riêng mặt trước và mặt sau CCCD.';
  if (documents.some(document => !validDocument(document, userId))) return 'Thông tin ảnh CCCD chưa hợp lệ. Hãy chọn lại ảnh.';
  if (front[0].storageObjectPath === back[0].storageObjectPath) return 'Hai mặt CCCD phải là hai tệp riêng biệt.';
  return null;
}
