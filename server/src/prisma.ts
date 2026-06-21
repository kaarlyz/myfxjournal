import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prismaLog: Array<'query' | 'info' | 'warn' | 'error'> =
  process.env.PRISMA_QUERY_LOG === 'true'
    ? ['query', 'warn', 'error']
    : ['warn', 'error'];

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: prismaLog,
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
