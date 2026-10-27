export const TYPE_LABELS = new Map<string, string>([
  ['preset', 'Preset / LUT'],
  ['template', 'Template'],
  ['pdf', 'PDF / ebook'],
  ['document', 'Document'],
  ['project_file', 'Project file'],
  ['software', 'Software'],
  ['course', 'Course'],
  ['tutorial', 'Tutorial'],
  ['other', 'Other'],
]);

export function hostOf(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return 'External destination';
  }
}

export const RESOURCE_TYPE_OPTIONS = [...TYPE_LABELS.entries()];
