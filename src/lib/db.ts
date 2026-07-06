import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

let prismaClient: PrismaClient | null = null;

function createPrismaClient(): PrismaClient {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/postgres',
  });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

function getPrisma(): PrismaClient {
  if (!prismaClient) {
    prismaClient = createPrismaClient();
  }
  return prismaClient;
}

export const prisma = getPrisma();

/** 判断错误是否为数据库连接问题 */
export function isDbError(error: any): boolean {
  const msg = error?.message || String(error);
  // Prisma 错误码: P1000=认证失败, P1001=无法连接, P1003=数据库不存在, P2024=连接池超时
  if (error?.code === 'P1000' || error?.code === 'P1001' || error?.code === 'P1003' || error?.code === 'P2024') return true;
  return msg.includes('connect') || msg.includes('ECONNREFUSED')
    || msg.includes('DATABASE_URL') || msg.includes('placeholder')
    || msg.includes('Authentication failed') || msg.includes('credentials');
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
