// Role is the unit of authorization. A user holds a set of roles; an endpoint
// declares which roles may access it (see `authorize` middleware). Roles are
// deliberately a closed union so a typo cannot introduce a wildcard role.
export const ROLES = ['CUSTOMER', 'ADMIN', 'SELLER', 'SUPPORT'] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
