import { canReportTechnicianIssue, technicianReportBody, technicianReportProblem, technicianReportReasons } from './technician-report';

describe('technician typed report', () => {
  it('requires a cause and 10..2000 chars', () => {
    expect(technicianReportProblem(null, 'mô tả đủ dài rồi')).toBe('Chọn nguyên nhân.');
    expect(technicianReportProblem('skill_gap', '  ngắn  ')).toContain('10');
    expect(technicianReportProblem('skill_gap', 'x'.repeat(2001))).toContain('2.000');
    expect(technicianReportProblem('severe_damage', 'Bo mạch cháy nặng')).toBeNull();
  });
  it('maps skill gap to the technician class and the rest to non-technician, report only', () => {
    expect(technicianReportBody('o1', 'skill_gap', ' Không sửa được bo  ')).toEqual({ intent: 'REPORT_ONLY', serviceOrderId: 'o1',
      reasonClass: 'technician_skill_gap', reasonCode: 'skill_gap', reason: 'Không sửa được bo' });
    for (const { code } of technicianReportReasons.filter(r => r.code !== 'skill_gap')) {
      expect(technicianReportBody('o1', code, 'x'.repeat(10)).reasonClass).toBe('non_technician_exception');
    }
    expect(technicianReportReasons.map(r => r.code)).not.toContain('customer_unreachable');
  });
  it('only on site before completion', () => {
    expect(canReportTechnicianIssue({ status: 'UNDER_REPAIR', arrivalVerified: true })).toBe(true);
    expect(canReportTechnicianIssue({ status: 'EN_ROUTE', arrivalVerified: false })).toBe(false);
    expect(canReportTechnicianIssue({ status: 'UNDER_REPAIR', arrivalVerified: true, completionRequestedAt: '2026-11-13' })).toBe(false);
    expect(canReportTechnicianIssue({ status: 'COMPLETED', arrivalVerified: true })).toBe(false);
    expect(canReportTechnicianIssue({ status: 'UNDER_REPAIR', arrivalVerified: true, historical: true })).toBe(false);
  });
});
