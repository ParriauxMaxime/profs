/**
 * The name a gradebook gets when the teacher does not choose one: the subject
 * and the class, which together are what distinguishes one gradebook from
 * another. It is only a default — the field stays editable — and it is a
 * stored value, so it is built here rather than translated at display time.
 */
export function defaultGradebookName(subjectName: string, className: string): string {
  const parts = [subjectName.trim(), className.trim()].filter((part) => part.length > 0);
  return parts.join(" — ");
}
