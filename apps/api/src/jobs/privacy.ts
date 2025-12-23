import { Queue } from 'bullmq';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { stringify } from 'csv-stringify';
import { env } from '../env';
import { prisma } from '../prisma';
import { createQueue, createWorker, createQueueScheduler } from '../queue';
import { incCounter } from '../utils/metrics';
import { AIProposalStatus, AIPatchStatus, PrivacyJobStatus, PrivacyJobType } from '@prisma/client';

const EXPORT_QUEUE = 'privacy-export';
const DELETE_QUEUE = 'privacy-delete';

const exportQueue = createQueue(EXPORT_QUEUE, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
const deleteQueue = createQueue(DELETE_QUEUE, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
createQueueScheduler(EXPORT_QUEUE);
createQueueScheduler(DELETE_QUEUE);

const inlineMode = process.env.NODE_ENV === 'test';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function csvStream(headers: string[], rows: any[]) {
  const stream = stringify({ header: true, columns: headers });
  rows.forEach((row) => stream.write(row));
  stream.end();
  return stream;
}

export async function enqueueExportJob(jobId: string) {
  if (inlineMode) return runPrivacyExportJob(jobId);
  await exportQueue.add('privacy-export', { jobId });
}

export async function enqueueDeleteJob(jobId: string) {
  if (inlineMode) return runPrivacyDeleteJob(jobId);
  await deleteQueue.add('privacy-delete', { jobId });
}

export async function runPrivacyExportJob(jobId: string) {
  const job = await prisma.privacyJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  await prisma.privacyJob.update({ where: { id: jobId }, data: { status: PrivacyJobStatus.RUNNING } });
  try {
    const userId = job.userId;
    const exportDir = path.resolve(env.EXPORT_DIR);
    ensureDir(exportDir);
    const filename = path.join(exportDir, `${jobId}.zip`);

    const output = fs.createWriteStream(filename);
    const archive = archiver('zip', { zlib: { level: 9 } });
    const done = new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', reject);
    });
    archive.pipe(output);

    const subscriptions = await prisma.subscription.findMany({ where: { userId } });
    archive.append(csvStream(['id', 'name', 'amount', 'currency', 'billingInterval', 'category', 'createdAt', 'updatedAt'], subscriptions), {
      name: 'subscriptions.csv'
    });

    const auditLogs = await prisma.auditLog.findMany({ where: { userId } });
    archive.append(csvStream(['id', 'action', 'metadata', 'createdAt'], auditLogs.map((a) => ({ ...a, metadata: JSON.stringify(a.metadata || {}) }))), {
      name: 'audit_logs.csv'
    });

    const aiLogs = await prisma.aIActionLog.findMany({ where: { userId } });
    archive.append(
      csvStream(
        ['id', 'actionType', 'topic', 'provider', 'latencyMs', 'success', 'createdAt'],
        aiLogs.map((a) => ({
          id: a.id,
          actionType: a.actionType,
          topic: a.topic,
          provider: a.provider,
          latencyMs: a.latencyMs,
          success: a.success,
          createdAt: a.createdAt
        }))
      ),
      { name: 'ai_logs.csv' }
    );

    const proposals = await prisma.aIProposal.findMany({ where: { userId } });
    archive.append(
      csvStream(
        ['id', 'type', 'status', 'title', 'summary', 'confidence', 'createdAt', 'expiresAt'],
        proposals.map((p) => ({
          id: p.id,
          type: p.type,
          status: p.status,
          title: p.title,
          summary: p.summary,
          confidence: p.confidence ?? '',
          createdAt: p.createdAt,
          expiresAt: p.expiresAt
        }))
      ),
      { name: 'ai_proposals.csv' }
    );

    const patches = await prisma.aIPatch.findMany({ where: { userId } });
    archive.append(
      csvStream(
        ['id', 'proposalId', 'status', 'appliedAt', 'rolledBackAt', 'changeCount'],
        patches.map((p) => ({
          id: p.id,
          proposalId: p.proposalId,
          status: p.status,
          appliedAt: p.appliedAt,
          rolledBackAt: p.rolledBackAt ?? '',
          changeCount: (p.patch as any)?.changes?.length || 0
        }))
      ),
      { name: 'ai_patches.csv' }
    );

    const detected = await prisma.detectedSubscription.findMany({ where: { userId } });
    archive.append(
      csvStream(['id', 'connectionId', 'name', 'amount', 'currency', 'billingInterval', 'confidence', 'status', 'createdAt'], detected),
      { name: 'detected_subscriptions.csv' }
    );

    const connections = await prisma.connection.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        type: true,
        status: true,
        scopes: true,
        institutionName: true,
        externalId: true,
        lastSyncedAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    archive.append(csvStream(Object.keys(connections[0] || { id: '', provider: '' }), connections), { name: 'connections.csv' });

    archive.append(csvStream(['note'], []), { name: 'notifications.csv' });
    archive.append(csvStream(['pref'], []), { name: 'preferences.csv' });

    archive.finalize();
    await done;

    const expiresAt = new Date(Date.now() + env.EXPORT_TTL_HOURS * 60 * 60 * 1000);
    await prisma.privacyJob.update({
      where: { id: jobId },
      data: { status: PrivacyJobStatus.SUCCEEDED, filePath: filename, expiresAt }
    });
    incCounter('exports');
    await prisma.auditLog.create({ data: { userId, action: 'privacy.export_succeeded', metadata: { jobId } } });
  } catch (error: any) {
    await prisma.privacyJob.update({
      where: { id: jobId },
      data: { status: PrivacyJobStatus.FAILED, error: error?.message || 'export failed' }
    });
    await prisma.auditLog.create({ data: { userId: job?.userId || '', action: 'privacy.export_failed', metadata: { jobId } } });
    throw error;
  }
}

export async function runPrivacyDeleteJob(jobId: string) {
  const job = await prisma.privacyJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  await prisma.privacyJob.update({ where: { id: jobId }, data: { status: PrivacyJobStatus.RUNNING } });
  const userId = job.userId;
  try {
    await prisma.auditLog.create({ data: { userId, action: 'privacy.delete_requested', metadata: { jobId } } });
    await prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId } });
      await tx.device.deleteMany({ where: { userId } });
      await tx.aIPatch.deleteMany({ where: { userId } });
      await tx.aIProposal.deleteMany({ where: { userId } });
      await tx.aIActionLog.deleteMany({ where: { userId } });
      await tx.auditLog.deleteMany({ where: { userId } });
      await tx.detectedSubscription.deleteMany({ where: { userId } });
      await tx.connection.deleteMany({ where: { userId } });
      await tx.subscription.deleteMany({ where: { userId } });
      await tx.user.deleteMany({ where: { id: userId } });
    });
    incCounter('deletes');
  } catch (error: any) {
    await prisma.privacyJob.update({
      where: { id: jobId },
      data: { status: PrivacyJobStatus.FAILED, error: error?.message || 'delete failed' }
    });
    await prisma.auditLog.create({ data: { userId, action: 'privacy.delete_failed', metadata: { jobId } } });
    throw error;
  }
}

export function setupPrivacyWorkers() {
  createWorker(
    EXPORT_QUEUE,
    async (job) => {
      await runPrivacyExportJob(job.data.jobId);
    },
    { concurrency: 2 }
  );
  createWorker(
    DELETE_QUEUE,
    async (job) => {
      await runPrivacyDeleteJob(job.data.jobId);
    },
    { concurrency: 1 }
  );
}

export async function cleanupExpiredExports() {
  const now = new Date();
  const expired = await prisma.privacyJob.findMany({
    where: { expiresAt: { lt: now }, status: PrivacyJobStatus.SUCCEEDED, filePath: { not: null } }
  });
  for (const job of expired) {
    if (job.filePath && fs.existsSync(job.filePath)) {
      fs.unlinkSync(job.filePath);
    }
    await prisma.privacyJob.update({ where: { id: job.id }, data: { status: PrivacyJobStatus.FAILED, error: 'expired' } });
  }
}
