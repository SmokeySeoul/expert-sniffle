import { FastifyInstance } from 'fastify';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { PrivacyJobStatus, PrivacyJobType } from '@prisma/client';
import { getExportDir } from '../privacy/config';
import { processPrivacyJob } from '../privacy/processor';
import { getPrivacyQueue, PRIVACY_JOB_NAME } from '../privacy/queue';
import { recordAuditLog } from '../utils/audit';

type ConfirmDeleteBody = {
  confirm?: string;
};

export async function privacyRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/export',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const job = await app.prisma.privacyJob.create({
        data: {
          userId,
          type: PrivacyJobType.EXPORT,
          status: PrivacyJobStatus.PENDING,
        },
      });

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'privacy.export.requested',
        metadata: { jobId: job.id },
      });

      if (process.env.INLINE_PRIVACY_WORKER === 'true') {
        await processPrivacyJob(job.id);
      } else if (process.env.SKIP_PRIVACY_QUEUE !== 'true') {
        await getPrivacyQueue().add(
          PRIVACY_JOB_NAME,
          { jobId: job.id },
          { jobId: job.id, removeOnComplete: true, removeOnFail: true },
        );
      }

      reply.status(202).send({ jobId: job.id });
    },
  );

  app.get(
    '/jobs',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const jobs = await app.prisma.privacyJob.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      reply.send({ jobs });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/jobs/:id',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const job = await app.prisma.privacyJob.findFirst({
        where: { id: request.params.id, userId },
      });

      if (!job) {
        reply.status(404).send({ error: 'Job not found' });
        return;
      }

      reply.send({ job });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/jobs/:id/download',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const userId = request.authUser!.sub;
      const job = await app.prisma.privacyJob.findFirst({
        where: { id: request.params.id, userId },
      });

      if (
        !job ||
        job.type !== PrivacyJobType.EXPORT ||
        job.status !== PrivacyJobStatus.SUCCEEDED ||
        !job.filePath ||
        !job.expiresAt ||
        job.expiresAt <= new Date()
      ) {
        reply.status(404).send({ error: 'File not available' });
        return;
      }

      const exportDir = getExportDir();
      const resolved = path.resolve(job.filePath);
      const resolvedExportDir = path.resolve(exportDir);

      if (!resolved.startsWith(resolvedExportDir)) {
        reply.status(403).send({ error: 'Forbidden' });
        return;
      }

      try {
        await fs.access(resolved);
      } catch {
        reply.status(404).send({ error: 'File not available' });
        return;
      }

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'privacy.export.downloaded',
        metadata: { jobId: job.id },
      });

      reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="privacy-export-${job.id}.zip"`)
        .send(createReadStream(resolved));
    },
  );

  app.post<{ Body: ConfirmDeleteBody }>(
    '/delete',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      if (request.body?.confirm !== 'DELETE') {
        reply.status(400).send({ error: 'Confirmation required' });
        return;
      }

      const userId = request.authUser!.sub;
      const job = await app.prisma.privacyJob.create({
        data: {
          userId,
          type: PrivacyJobType.DELETE,
          status: PrivacyJobStatus.PENDING,
        },
      });

      await recordAuditLog({
        userId,
        deviceId: request.authUser?.deviceId,
        sessionId: request.authUser?.sessionId,
        action: 'privacy.delete.requested',
        metadata: { jobId: job.id },
      });

      if (process.env.INLINE_PRIVACY_WORKER === 'true') {
        await processPrivacyJob(job.id);
      } else if (process.env.SKIP_PRIVACY_QUEUE !== 'true') {
        await getPrivacyQueue().add(
          PRIVACY_JOB_NAME,
          { jobId: job.id },
          { jobId: job.id, removeOnComplete: true, removeOnFail: true },
        );
      }

      reply.status(202).send({ jobId: job.id });
    },
  );
}
