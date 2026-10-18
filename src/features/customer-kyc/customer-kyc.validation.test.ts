import {
  inferCustomerKycMimeType,
  validateCustomerKycDocuments,
  validateCustomerKycForm,
  validateVnDateOfBirth,
  type CustomerKycFormValues,
  type UploadedCustomerKycDocument,
} from './customer-kyc.validation';

const today = { year: 2026, month: 10, day: 17 };
const validForm: CustomerKycFormValues = {
  fullName: 'Nguyễn Văn An',
  dateOfBirth: '1995-06-15',
  gender: 'MALE',
  citizenIdNumber: '079123456789',
  address: '12 Nguyễn Trãi, Quận 1',
};

describe('Vietnam customer KYC validation', () => {
  it('requires a real date from 1900 and age 18 on Vietnam calendar date', () => {
    expect(validateVnDateOfBirth('2008-10-17', today)).toBeNull();
    expect(validateVnDateOfBirth('2008-10-18', today)).not.toBeNull();
    expect(validateVnDateOfBirth('1900-01-01', today)).toBeNull();
    expect(validateVnDateOfBirth('1899-12-31', today)).not.toBeNull();
    expect(validateVnDateOfBirth('2000-02-29', today)).toBeNull();
    expect(validateVnDateOfBirth('1900-02-29', today)).not.toBeNull();
    expect(validateVnDateOfBirth('2026-13-01', today)).not.toBeNull();
  });

  it('validates required identity fields without coercing CCCD digits', () => {
    expect(validateCustomerKycForm(validForm, today)).toEqual({});
    expect(validateCustomerKycForm({ ...validForm, citizenIdNumber: '079 123456789' }, today).citizenIdNumber).toBeTruthy();
    expect(validateCustomerKycForm({ ...validForm, gender: 'UNSPECIFIED' as never }, today).gender).toBeTruthy();
    expect(validateCustomerKycForm({ ...validForm, fullName: 'A' }, today).fullName).toBeTruthy();
    expect(validateCustomerKycForm({ ...validForm, address: '1234' }, today).address).toBeTruthy();
    expect(validateCustomerKycForm({ ...validForm, dateOfBirth: '2008-10-18' }, today).dateOfBirth).toBeTruthy();
  });

  it('requires MIME and filename extension to agree for JPEG, PNG, and WEBP', () => {
    expect(inferCustomerKycMimeType('image/jpeg', 'file:///cccd.jpg')).toBe('image/jpeg');
    expect(inferCustomerKycMimeType('image/jpeg', 'file:///cccd.jpeg')).toBe('image/jpeg');
    expect(inferCustomerKycMimeType('image/png', 'file:///cccd.png')).toBe('image/png');
    expect(inferCustomerKycMimeType('image/webp', 'file:///cccd.webp')).toBe('image/webp');
    expect(inferCustomerKycMimeType('image/jpeg', 'file:///cccd.png')).toBeNull();
    expect(inferCustomerKycMimeType('image/gif', 'file:///cccd.gif')).toBeNull();
    expect(inferCustomerKycMimeType(undefined, 'file:///cccd.jpg')).toBe('image/jpeg');
  });

  it('requires exactly two distinct customer-owned paths with matching metadata and size', () => {
    const front: UploadedCustomerKycDocument = {
      documentType: 'citizen_id_front', storageObjectPath: 'kyc/customer-1/front.jpg',
      fileName: 'cccd-mat-truoc.jpg', fileSize: 1, mimeType: 'image/jpeg',
    };
    const back: UploadedCustomerKycDocument = {
      documentType: 'citizen_id_back', storageObjectPath: 'kyc/customer-1/back.webp',
      fileName: 'cccd-mat-sau.webp', fileSize: 10 * 1024 * 1024, mimeType: 'image/webp',
    };
    expect(validateCustomerKycDocuments([front, back], 'customer-1')).toBeNull();
    expect(validateCustomerKycDocuments([front], 'customer-1')).not.toBeNull();
    expect(validateCustomerKycDocuments([front, { ...back, documentType: front.documentType }], 'customer-1')).not.toBeNull();
    expect(validateCustomerKycDocuments([front, { ...back, storageObjectPath: front.storageObjectPath }], 'customer-1')).not.toBeNull();
    expect(validateCustomerKycDocuments([front, { ...back, storageObjectPath: 'kyc/customer-2/back.webp' }], 'customer-1')).not.toBeNull();
    expect(validateCustomerKycDocuments([front, { ...back, storageObjectPath: 'kyc/customer-1/../other.webp' }], 'customer-1')).not.toBeNull();
    expect(validateCustomerKycDocuments([front, { ...back, fileName: 'back.png' }], 'customer-1')).not.toBeNull();
    expect(validateCustomerKycDocuments([front, { ...back, fileSize: 0 }], 'customer-1')).not.toBeNull();
    expect(validateCustomerKycDocuments([front, { ...back, fileSize: 10 * 1024 * 1024 + 1 }], 'customer-1')).not.toBeNull();
  });
});
