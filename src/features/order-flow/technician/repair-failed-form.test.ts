import { repairFailedBody, repairFailedProblem } from './repair-failed-form';

const parts = [{ id: 'p1' }, { id: 'p2' }];

describe('repairFailedProblem', () => {
  it('asks for an outcome on every part instead of assuming one', () => {
    expect(repairFailedProblem({ parts, outcomes: { p1: 'installed' }, photoCount: 0 })).toContain('từng linh kiện');
    expect(repairFailedProblem({ parts, outcomes: { p1: 'installed', p2: 'returned' }, photoCount: 0 })).toBeNull();
    expect(repairFailedProblem({ parts: [], outcomes: {}, photoCount: 0 })).toBeNull();
  });
  it('allows at most 3 photos', () => {
    expect(repairFailedProblem({ parts: [], outcomes: {}, photoCount: 4 })).toContain('3');
  });
});

describe('repairFailedBody', () => {
  it('cuts the note at 500, sorts photos so a retry compares equal, and keeps part outcomes', () => {
    const body = repairFailedBody({ reason: 'no_part', note: ` ${'x'.repeat(600)} `, parts, outcomes: { p1: 'installed', p2: 'returned' }, photoEvidenceIds: ['b', 'a'] });
    expect(body.note).toHaveLength(500);
    expect(body.photoEvidenceIds).toEqual(['a', 'b']);
    expect(body.parts).toEqual([{ partRequestId: 'p1', outcome: 'installed' }, { partRequestId: 'p2', outcome: 'returned' }]);
  });
  it('leaves out an empty note, photos and parts', () => {
    expect(repairFailedBody({ reason: 'other', note: '  ', parts: [], outcomes: {}, photoEvidenceIds: [] })).toEqual({ reason: 'other' });
  });
});
