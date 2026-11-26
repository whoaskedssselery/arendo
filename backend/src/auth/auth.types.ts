export const publicRoles = ['tenant', 'owner'] as const;
export type Role = (typeof publicRoles)[number] | 'admin';

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  status: 'active' | 'banned';
  created_at: Date;
}

export interface AccessClaims {
  sub: string;
  sid: string;
}

export interface AuthenticatedSession {
  id: string;
  user: UserRow;
}

export interface AuthRequest {
  headers: { authorization?: string };
  auth?: AuthenticatedSession;
}

export function userResponse(user: UserRow) {
  return {
    id: Number(user.id),
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.created_at.toISOString(),
  };
}
