export const USER_ROLES = {
  CUSTOMER: 'customer',
  OWNER: 'owner',
  ADMIN: 'admin',
} as const;

export const USER_ROLE_LABELS: Record<string, string> = {
  customer: '고객',
  owner: '꽃집 사장님',
  admin: '관리자',
};
