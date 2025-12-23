import archiver from 'archiver';
import { PrivacyJobStatus, PrivacyJobType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { once } from 'events';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../prisma';
import { recordAuditLog } from '../utils/audit';
import { getExportDir, getExportTtlHours } from './config';

type ExportRow = Record<string, unknown>;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Decimal) {
    return value.toString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function toCsv(rows: ExportRow[]): string {
  if (rows.length === 0) {
    return '';
  }

  const headers = Array.from(
    rows.reduce<Set<string>>((acc, row) => {
      Object.keys(row).forEach((key) => acc.add(key));
      return acc;
    }, new Set<string>()),
  );

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const headerLine = headers.map((key) => escape(key)).join(',');
  const dataLines = rows.map((row) =>
    headers.map((key) => escape(formatValue(row[key]))).join(','),
  );

  return [headerLine, ...dataLines].join('\n');
}

async function buildExportRows(userId: string): Promise<Record<string, ExportRow[]>> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error('User not found');
  }

  const [subscriptions, notifications, auditLogs, aiActionLogs, aiProposals, aiPatches, devices, sessions] =
    await Promise.all([
      prisma.subscription.findMany({ where: { userId } }),
      prisma.notification.findMany({ where: { userId } }),
      prisma.auditLog.findMany({ where: { userId } }),
      prisma.aIActionLog.findMany({ where: { userId } }),
      prisma.aIProposal.findMany({ where: { userId } }),
      prisma.aIPatch.findMany({ where: { userId } }),
      prisma.device.findMany({ where: { userId } }),
      prisma.session.findMany({ where: { userId } }),
    ]);

  return {
    'users.csv': [
      {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    ],
    'subscriptions.csv': subscriptions.map((sub) => ({
      id: sub.id,
      name: sub.name,
      amount: sub.amount,
      currency: sub.currency,
      billingInterval: sub.billingInterval,
      nextBillingDate: sub.nextBillingDate,
      category: sub.category,
      active: sub.active,
      isTrial: sub.isTrial,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    })),
    'notifications.csv': notifications.map((notif) => ({
      id: notif.id,
      type: notif.type,
      title: notif.title,
      body: notif.body,
      scheduledFor: notif.scheduledFor,
      sentAt: notif.sentAt,
      readAt: notif.readAt,
      priority: notif.priority,
      metadata: notif.metadata,
      createdAt: notif.createdAt,
    })),
    'audit_logs.csv': auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      deviceId: log.deviceId,
      sessionId: log.sessionId,
      metadata: log.metadata,
      createdAt: log.createdAt,
    })),
    'ai_logs.csv': aiActionLogs.map((log) => ({
      id: log.id,
      actionType: log.actionType,
      topic: log.topic,
      inputRedacted: log.inputRedacted,
      outputSummary: log.outputSummary,
      confidence: log.confidence,
      provider: log.provider,
      success: log.success,
      latencyMs: log.latencyMs,
      createdAt: log.createdAt,
    })),
    'proposals.csv': aiProposals.map((proposal) => ({
      id: proposal.id,
      type: proposal.type,
      status: proposal.status,
      title: proposal.title,
      summary: proposal.summary,
      payload: proposal.payload,
      confidence: proposal.confidence,
      createdAt: proposal.createdAt,
      expiresAt: proposal.expiresAt,
    })),
    'patches.csv': aiPatches.map((patch) => ({
      id: patch.id,
      proposalId: patch.proposalId,
      type: patch.type,
      status: patch.status,
      forwardPatch: patch.forwardPatch,
      rollbackPatch: patch.rollbackPatch,
      appliedAt: patch.appliedAt,
      rolledBackAt: patch.rolledBackAt,
      createdAt: patch.createdAt,
    })),
    'devices.csv': devices.map((device) => ({
      id: device.id,
      name: device.name,
      trusted: device.trusted,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    })),
    'sessions.csv': sessions.map((session) => ({
      id: session.id,
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })),
  };
}

async function writeExportZip(jobId: string, userId: string): Promise<{ path: string; expiresAt: Date }> {
  const exportDir = getExportDir();
  await fs.mkdir(exportDir, { recursive: true });
  const zipPath = path.join(exportDir, `privacy-export-${jobId}.zip`);

  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);

  const datasets = await buildExportRows(userId);
  for (const [filename, rows] of Object.entries(datasets)) {
    archive.append(toCsv(rows), { name: filename });
  }

  await archive.finalize();
  await once(output, 'close');

  const expiresAt = new Date(Date.now() + getExportTtlHours() * 60 * 60 * 1000);
  return { path: zipPath, expiresAt };
}

async function deleteUserData(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });

    await tx.auditLog.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });
    await tx.subscription.deleteMany({ where: { userId } });
    await tx.device.deleteMany({ where: { userId } });
    await tx.aIPatch.deleteMany({ where: { userId } });
    await tx.aIProposal.deleteMany({ where: { userId } });
    await tx.aIActionLog.deleteMany({ where: { userId } });
    await tx.user.deleteMany({ where: { id: userId } });
  });
}

export async function processPrivacyJob(jobId: string): Promise<void> {
  const job = await prisma.privacyJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return;
  }

  if (job.status !== PrivacyJobStatus.PENDING) {
    return;
  }

  if (!job.userId) {
    await prisma.privacyJob.update({
      where: { id: jobId },
      data: {
        status: PrivacyJobStatus.FAILED,
        completedAt: new Date(),
      },
    });
    return;
  }

  const startedAt = new Date();
  await prisma.privacyJob.update({
    where: { id: jobId },
    data: { status: PrivacyJobStatus.RUNNING, startedAt },
  });

  try {
    if (job.type === PrivacyJobType.EXPORT) {
      const result = await writeExportZip(job.id, job.userId);
      await recordAuditLog({
        userId: job.userId,
        action: 'privacy.export.completed',
        metadata: { jobId: job.id },
      });
      await prisma.privacyJob.update({
        where: { id: jobId },
        data: {
          status: PrivacyJobStatus.SUCCEEDED,
          completedAt: new Date(),
          filePath: result.path,
          expiresAt: result.expiresAt,
        },
      });
    } else if (job.type === PrivacyJobType.DELETE) {
      await recordAuditLog({
        userId: job.userId,
        action: 'privacy.delete.completed',
        metadata: { jobId: job.id },
      });
      await deleteUserData(job.userId);
      await prisma.privacyJob.update({
        where: { id: jobId },
        data: {
          status: PrivacyJobStatus.SUCCEEDED,
          completedAt: new Date(),
          expiresAt: null,
          filePath: null,
        },
      });
    }
  } catch (error) {
    await prisma.privacyJob.update({
      where: { id: jobId },
      data: {
        status: PrivacyJobStatus.FAILED,
        completedAt: new Date(),
      },
    });
  }
}
