import { FastifyInstance } from 'fastify';
import { redactMetadata } from '../utils/audit';

type AuditQuery = {
  page?: string;
  pageSize?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            pageSize: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { page = '1', pageSize = `${DEFAULT_PAGE_SIZE}` } = request.query as AuditQuery;
      const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      const skip = (pageNumber - 1) * limit;
      const userId = request.authUser!.sub;

      const [logs, total] = await app.prisma.$transaction([
        app.prisma.auditLog.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        app.prisma.auditLog.count({ where: { userId } }),
      ]);

      reply.send({
        logs: logs.map((log) => ({
          ...log,
          metadata: redactMetadata(log.metadata),
        })),
        page: pageNumber,
        pageSize: limit,
        total,
      });
    },
  );
}
