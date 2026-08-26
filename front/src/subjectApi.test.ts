import { describe, expect, it } from 'vitest';
import { createSubjectId, subjectInitials } from './api';

describe('subject onboarding adapter', () => {
  it('derives a stable subject id and initials from the supplied identity', () => {
    expect(createSubjectId('Alex Rivera')).toBe('alex-rivera');
    expect(subjectInitials('Alex Rivera')).toBe('AR');
  });

  it('rejects an identity that cannot select a subject safely', () => {
    expect(() => createSubjectId('   ')).toThrow('A subject name is required');
  });
});
