import { AppDatabase } from '../../db';
import * as schema from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { User, RoleCode, PermissionCode } from '../../shared/types';

export class UserRepository {
  constructor(private db: AppDatabase) {}

  async findByEmail(email: string): Promise<User | null> {
    const res = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase().trim()))
      .limit(1);

    if (res.length === 0) return null;

    const u = res[0];
    return {
      id: u.id,
      empCode: u.empCode,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  async findPasswordHashByEmail(email: string): Promise<{ user: User; passwordHash: string } | null> {
    const res = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase().trim()))
      .limit(1);

    if (res.length === 0) return null;

    const u = res[0];
    return {
      user: {
        id: u.id,
        empCode: u.empCode,
        name: u.name,
        email: u.email,
        phone: u.phone,
        status: u.status,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      },
      passwordHash: u.passwordHash,
    };
  }

  async findById(id: string): Promise<User | null> {
    const res = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    if (res.length === 0) return null;

    const u = res[0];
    return {
      id: u.id,
      empCode: u.empCode,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  async getUserRoles(userId: string): Promise<RoleCode[]> {
    const rows = await this.db
      .select({ code: schema.roles.code })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(eq(schema.userRoles.userId, userId));

    return rows.map(r => r.code as RoleCode);
  }

  async getUserPermissions(userId: string): Promise<PermissionCode[]> {
    // Join user_roles -> role_permissions -> permissions
    const rows = await this.db
      .select({ code: schema.permissions.code })
      .from(schema.userRoles)
      .innerJoin(schema.rolePermissions, eq(schema.userRoles.roleId, schema.rolePermissions.roleId))
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.userRoles.userId, userId));

    const set = new Set<PermissionCode>();
    rows.forEach(r => set.add(r.code as PermissionCode));
    return Array.from(set);
  }

  async createUser(data: {
    id: string;
    empCode: string;
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    roleCodes: string[];
    createdAt: string;
    updatedAt: string;
  }): Promise<User> {
    await this.db.insert(schema.users).values({
      id: data.id,
      empCode: data.empCode,
      name: data.name,
      email: data.email.toLowerCase().trim(),
      phone: data.phone,
      passwordHash: data.passwordHash,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });

    // Find role IDs for given role codes
    if (data.roleCodes.length > 0) {
      const foundRoles = await this.db
        .select()
        .from(schema.roles)
        .where(inArray(schema.roles.code, data.roleCodes));

      const roleMappings = foundRoles.map(r => ({
        userId: data.id,
        roleId: r.id,
      }));

      if (roleMappings.length > 0) {
        await this.db.insert(schema.userRoles).values(roleMappings);
      }
    }

    return {
      id: data.id,
      empCode: data.empCode,
      name: data.name,
      email: data.email,
      phone: data.phone,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  async updateUser(id: string, data: Partial<{
    name: string;
    email: string;
    phone: string;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    updatedAt: string;
  }>): Promise<void> {
    await this.db
      .update(schema.users)
      .set(data)
      .where(eq(schema.users.id, id));
  }

  async listAllUsers(): Promise<User[]> {
    const list = await this.db.select().from(schema.users);
    return list.map(u => ({
      id: u.id,
      empCode: u.empCode,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }
}
