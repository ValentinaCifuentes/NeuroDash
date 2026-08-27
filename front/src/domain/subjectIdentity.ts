export function createSubjectId(displayName: string): string {
  const subjectId = displayName
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  if (!subjectId) throw new Error('A subject name is required');
  return subjectId;
}

export function subjectInitials(displayName: string): string {
  return displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
