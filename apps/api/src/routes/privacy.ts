import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma';
import { enqueueDeleteJob, enqueueExportJob } from '../jobs/privacy';
import { PrivacyJobStatus, PrivacyJobType } from '@prisma/client';

const exportBody = z.object({});
const deleteBody = z.object({ confirm: z.literal('DELETE') });

export async function privacyRoutes(fastify: FastifyInstance) {
  fastify.post('/privacy/export', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    exportBody.parse(request.body || {});
    const userId = request.user!.userId;
    const job = await prisma.privacyJob.create({
      data: {
        userId,
        deviceId: request.user!.deviceId,
        sessionId: request.user!.sessionId,
        type: PrivacyJobType.EXPORT,
        status: PrivacyJobStatus.QUEUED
      }
    });
    await prisma.auditLog.create({ data: { userId, action: 'privacy.export_requested', metadata: { jobId: job.id } } });
    await enqueueExportJob(job.id);
    return { jobId: job.id };
  });

  fastify.get('/privacy/export/:jobId', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    const { jobId } = request.params as any;
    const job = await prisma.privacyJob.findFirst({ where: { id: jobId, userId: request.user!.userId } });
    if (!job) return reply.code(404).send({ message: 'Not found' });
    return { status: job.status, error: job.error, expiresAt: job.expiresAt };
  });

  fastify.get('/privacy/export/:jobId/download', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    const { jobId } = request.params as any;
    const job = await prisma.privacyJob.findFirst({ where: { id: jobId, userId: request.user!.userId } });
    if (!job) return reply.code(404).send({ message: 'Not found' });
    if (job.status !== PrivacyJobStatus.SUCCEEDED || !job.filePath) return reply.code(400).send({ message: 'Not ready' });
    if (job.expiresAt && job.expiresAt.getTime() < Date.now()) return reply.code(410).send({ message: 'Expired' });
    if (!fs.existsSync(job.filePath)) return reply.code(404).send({ message: 'File missing' });
    await prisma.auditLog.create({ data: { userId: request.user!.userId, action: 'privacy.export_downloaded', metadata: { jobId } } });
    reply.header('content-type', 'application/zip');
    reply.header('content-disposition', `attachment; filename="export-${jobId}.zip"`);
    return fs.createReadStream(job.filePath);
  });

  fastify.post('/privacy/delete', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    deleteBody.parse(request.body || {});
    const userId = request.user!.userId;
    const job = await prisma.privacyJob.create({
      data: {
        userId,
        deviceId: request.user!.deviceId,
        sessionId: request.user!.sessionId,
        type: PrivacyJobType.DELETE,
        status: PrivacyJobStatus.QUEUED
      }
    });
    await prisma.auditLog.create({ data: { userId, action: 'privacy.delete_requested', metadata: { jobId: job.id } } });
    await enqueueDeleteJob(job.id);
    return { jobId: job.id };
  });

  fastify.get('/privacy/delete/:jobId', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    const { jobId } = request.params as any;
    const job = await prisma.privacyJob.findFirst({ where: { id: jobId, userId: request.user!.userId } });
    if (!job) return reply.code(404).send({ message: 'Not found' });
    return { status: job.status, error: job.error };
  });
}
