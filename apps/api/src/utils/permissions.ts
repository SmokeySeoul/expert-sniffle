import { User } from '@prisma/client';

// CALM MVP: permissions are default-deny and must remain user-controlled.
export const PERMISSION_FLAGS = {
  bankConnectionsEnabled: {
    description: 'Allow connecting external bank accounts to import financial data.',
  },
  emailParsingEnabled: {
    description: 'Allow parsing emails to ingest subscription or receipt information.',
  },
  aiAssistEnabled: {
    description: 'Allow AI-powered assistance for insights and responses.',
  },
  autopilotEnabled: {
    description: 'Allow automated actions such as canceling subscriptions or making changes.',
  },
} as const;

export type PermissionFlag = keyof typeof PERMISSION_FLAGS;

const PERMISSION_ERROR_MESSAGES: Record<PermissionFlag, string> = {
  bankConnectionsEnabled: 'Bank connections disabled',
  emailParsingEnabled: 'Email parsing disabled',
  aiAssistEnabled: 'AI assistance disabled',
  autopilotEnabled: 'Autopilot disabled',
};

export function requirePermission(user: Pick<User, PermissionFlag>, flag: PermissionFlag): void {
  if (!user[flag]) {
    const error = new Error(PERMISSION_ERROR_MESSAGES[flag] ?? 'Permission disabled');
    (error as { statusCode?: number; flag?: PermissionFlag }).statusCode = 403;
    (error as { flag?: PermissionFlag }).flag = flag;
    throw error;
  }
}

export function buildPermissionPayload(user: Pick<User, PermissionFlag>): Record<
  PermissionFlag,
  { enabled: boolean; description: string }
> {
  return Object.entries(PERMISSION_FLAGS).reduce((acc, [flag, details]) => {
    const key = flag as PermissionFlag;
    acc[key] = { enabled: user[key], description: details.description };
    return acc;
  }, {} as Record<PermissionFlag, { enabled: boolean; description: string }>);
}
