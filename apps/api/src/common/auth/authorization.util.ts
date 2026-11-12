import { ForbiddenException, NotFoundException } from '@nestjs/common';

export function isOwner(
  resourceUserId: string,
  currentUserId: string,
): boolean {
  return resourceUserId === currentUserId;
}

export function assertOwnership(
  resourceUserId: string,
  currentUserId: string,
  resourceName = 'Resource',
): void {
  if (!isOwner(resourceUserId, currentUserId)) {
    throw new ForbiddenException(
      `You do not have permission to access this ${resourceName.toLowerCase()}`,
    );
  }
}

export function assertResourceExists<T>(
  resource: T | null | undefined,
  resourceName = 'Resource',
): asserts resource is T {
  if (resource === null || resource === undefined) {
    throw new NotFoundException(`${resourceName} not found`);
  }
}

export function assertOwnedResource<T extends { userId: string }>(
  resource: T | null | undefined,
  currentUserId: string,
  resourceName = 'Resource',
): asserts resource is T {
  assertResourceExists(resource, resourceName);
  assertOwnership(resource.userId, currentUserId, resourceName);
}
