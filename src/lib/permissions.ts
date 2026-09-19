export function isOwner(ownerIds: string[], userId: string): boolean {
  return ownerIds.includes(userId);
}
