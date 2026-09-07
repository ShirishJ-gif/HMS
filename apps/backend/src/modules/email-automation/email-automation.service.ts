import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AuditAction,
  AutomationDecision,
  BookingStatus,
  EmailCategory,
  EmailConnectionStatus,
  EmailProviderType,
  EmailSource,
  IncomingEmailStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionStatus,
  Prisma,
  ParserType,
} from '@prisma/client';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty } from '../auth/property-scope';
import { BackgroundJobService } from '../background-job/background-job.service';
import { InventoryService } from '../inventory/inventory.service';
import { EmailAutomationPolicyService } from './automation/email-automation-policy.service';
import { EmailReservationResolverService } from './automation/email-reservation-resolver.service';
import { EmailActivityQueryDto } from './dto/email-activity-query.dto';
import { CreateEmailConnectionDto } from './dto/create-email-connection.dto';
import { IngestEmailDto } from './dto/ingest-email.dto';
import { ReviewEmailDto } from './dto/review-email.dto';
import { UpdateEmailConnectionFiltersDto } from './dto/update-email-connection-filters.dto';
import { ParserRegistryService } from './parsers/parser-registry.service';
import { NormalizedProviderEmail, ParsedEmailEvent } from './types';
import { CredentialEncryptionService } from './credential-encryption.service';
import { OAuthStateService } from './oauth-state.service';
import { GmailEmailProvider } from './providers/gmail-email.provider';
import { MicrosoftEmailProvider } from './providers/microsoft-email.provider';
import { OAuthEmailProvider, StoredOAuthCredential } from './providers/oauth-provider.types';

@Injectable()
export class EmailAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('EmailAutomation');
  private syncTimer?: NodeJS.Timeout;
  private syncInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly parserRegistry: ParserRegistryService,
    private readonly resolver: EmailReservationResolverService,
    private readonly policy: EmailAutomationPolicyService,
    private readonly auditLogService: AuditLogService,
    private readonly inventoryService: InventoryService,
    private readonly backgroundJobService: BackgroundJobService,
    private readonly credentialEncryptionService: CredentialEncryptionService,
    private readonly oauthStateService: OAuthStateService,
    private readonly gmailEmailProvider: GmailEmailProvider,
    private readonly microsoftEmailProvider: MicrosoftEmailProvider,
  ) {}

  onModuleInit() {
    if (process.env.EMAIL_AUTOMATION_ENABLED === 'false' || process.env.EMAIL_PROVIDER_SYNC_DISABLED === 'true') {
      return;
    }
    const pollMs = Math.max(Number(process.env.EMAIL_PROVIDER_SYNC_POLL_MS ?? 60_000), 30_000);
    this.syncTimer = setInterval(() => {
      void this.syncDueConnections().catch((error: unknown) => {
        this.logger.error(JSON.stringify({ message: error instanceof Error ? error.message : 'Email sync loop failed' }));
      });
    }, pollMs);
    this.syncTimer.unref();
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  async getReadiness() {
    return {
      gmail: {
        configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        required_scope: 'https://www.googleapis.com/auth/gmail.readonly',
        production_dependency: 'Google restricted-scope verification and possible security assessment',
      },
      microsoft: {
        configured: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
        required_scope: 'Mail.Read',
      },
      imap: {
        configured: true,
        security_requirement: 'TLS/IMAPS credentials must be encrypted before production use',
      },
    };
  }

  async listConnections(propertyId: string, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const connections = await this.prisma.emailConnection.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });
    return connections.map((connection) => ({
      id: connection.id,
      property_id: connection.propertyId,
      provider: connection.provider,
      status: connection.status,
      email_address: connection.emailAddress,
      provider_account_id: connection.providerAccountId,
      last_sync_at: connection.lastSyncAt?.toISOString() ?? null,
      last_success_at: connection.lastSuccessAt?.toISOString() ?? null,
      last_error_code: connection.lastErrorCode,
      last_error_message: connection.lastErrorMessage,
      trusted_from_email: connection.trustedFromEmail,
      trusted_subject: connection.trustedSubject,
      created_at: connection.createdAt.toISOString(),
      updated_at: connection.updatedAt.toISOString(),
    }));
  }

  async updateConnectionFilters(
    propertyId: string,
    connectionId: string,
    dto: UpdateEmailConnectionFiltersDto,
    user?: AuthenticatedUser,
  ) {
    assertCanAccessProperty(user, propertyId);
    const connection = await this.prisma.emailConnection.findFirst({ where: { id: connectionId, propertyId } });
    if (!connection) throw new NotFoundException('Email connection not found');
    await this.prisma.emailConnection.update({
      where: { id: connection.id },
      data: {
        trustedFromEmail: dto.trusted_from_email?.trim() || null,
        trustedSubject: dto.trusted_subject?.trim() || null,
        providerCursor: null,
      },
    });
    return this.listConnections(propertyId, user);
  }

  async createConnection(propertyId: string, dto: CreateEmailConnectionDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property not found');
    if (dto.provider !== EmailProviderType.MANUAL) {
      throw new BadRequestException('OAuth/IMAP provider setup is not configured in this environment. Use manual ingestion or configure provider credentials.');
    }

    const connection = await this.prisma.emailConnection.upsert({
      where: { propertyId_emailAddress: { propertyId, emailAddress: dto.email_address.toLowerCase() } },
      create: {
        tenantId: property.organizationId,
        propertyId,
        provider: dto.provider,
        status: EmailConnectionStatus.CONNECTED,
        emailAddress: dto.email_address.toLowerCase(),
        providerAccountId: dto.provider_account_id ?? dto.email_address.toLowerCase(),
        lastSuccessAt: new Date(),
      },
      update: {
        status: EmailConnectionStatus.CONNECTED,
        providerAccountId: dto.provider_account_id ?? dto.email_address.toLowerCase(),
        lastSuccessAt: new Date(),
      },
    });

    await this.auditLogService.record({
      action: AuditAction.CREATE,
      entityType: 'email_connection',
      entityId: connection.id,
      propertyId,
      summary: `Connected ${connection.emailAddress} for email automation`,
      metadata: { provider: connection.provider },
      user,
    });

    return this.listConnections(propertyId, user);
  }

  async startOAuthConnection(propertyId: string, providerType: EmailProviderType, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    if (!user) throw new BadRequestException('Authenticated user is required');
    const provider = this.provider(providerType);
    const state = this.oauthStateService.sign({ provider: providerType, propertyId, userId: user.sub });
    return { provider: providerType, auth_url: provider.buildAuthUrl(state), configured: true };
  }

  async completeOAuthConnection(providerType: EmailProviderType, code: string, state: string) {
    const verifiedState = this.oauthStateService.verify(state, providerType);
    const provider = this.provider(providerType);
    const property = await this.prisma.property.findUnique({ where: { id: verifiedState.propertyId } });
    if (!property) throw new NotFoundException('Property not found');

    const { credential, profile } = await provider.exchangeCode(code);
    const connection = await this.prisma.emailConnection.upsert({
      where: {
        propertyId_emailAddress: {
          propertyId: property.id,
          emailAddress: profile.emailAddress.toLowerCase(),
        },
      },
      create: {
        tenantId: property.organizationId,
        propertyId: property.id,
        provider: providerType,
        status: EmailConnectionStatus.CONNECTED,
        emailAddress: profile.emailAddress.toLowerCase(),
        providerAccountId: profile.providerAccountId,
        encryptedCredential: this.credentialEncryptionService.encrypt(credential),
        grantedScopes: credential.scope,
        providerCursor: profile.cursor,
        lastSuccessAt: new Date(),
      },
      update: {
        provider: providerType,
        status: EmailConnectionStatus.CONNECTED,
        providerAccountId: profile.providerAccountId,
        encryptedCredential: this.credentialEncryptionService.encrypt(credential),
        grantedScopes: credential.scope,
        providerCursor: profile.cursor,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastSuccessAt: new Date(),
      },
    });

    try {
      await this.syncConnection(connection.id);
    } catch (error) {
      this.logger.warn(JSON.stringify({
        connection_id: connection.id,
        message: error instanceof Error ? error.message : 'Initial provider sync failed',
      }));
    }
    return {
      connection_id: connection.id,
      property_id: property.id,
      email_address: profile.emailAddress,
      provider: providerType,
      redirect_url: this.frontendRedirectUrl(),
    };
  }

  async disconnect(propertyId: string, connectionId: string, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const connection = await this.prisma.emailConnection.findFirst({ where: { id: connectionId, propertyId } });
    if (!connection) throw new NotFoundException('Email connection not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.incomingEmail.deleteMany({ where: { connectionId: connection.id } });
      return tx.emailConnection.update({
        where: { id: connection.id },
        data: {
          status: EmailConnectionStatus.DISCONNECTED,
          providerCursor: null,
          lastSyncAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
    });
    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'email_connection',
      entityId: updated.id,
      propertyId,
      summary: `Disconnected ${updated.emailAddress} from email automation`,
      metadata: { provider: updated.provider },
      user,
    });
    return { id: updated.id, status: updated.status };
  }

  async ingest(propertyId: string, connectionId: string, dto: IngestEmailDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const connection = await this.prisma.emailConnection.findFirst({
      where: { id: connectionId, propertyId, status: { not: EmailConnectionStatus.DISCONNECTED } },
      include: { property: true },
    });
    if (!connection) throw new NotFoundException('Active email connection not found');

    const normalized: NormalizedProviderEmail = {
      providerMessageId: dto.provider_message_id,
      providerThreadId: dto.provider_thread_id,
      internetMessageId: dto.internet_message_id,
      from: dto.from,
      to: [],
      cc: [],
      subject: dto.subject.trim(),
      receivedAt: dto.received_at ? new Date(dto.received_at) : new Date(),
      sentAt: dto.sent_at ? new Date(dto.sent_at) : undefined,
      plainText: dto.plain_text?.slice(0, 100_000),
      attachments: (dto.attachments ?? []).map((attachment) => ({
        providerAttachmentId: attachment.provider_attachment_id,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
      })),
      headers: {},
    };

    const email = await this.persistProviderEmail(connectionId, propertyId, connection.property.organizationId, normalized);

    await this.prisma.emailConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date(), lastSuccessAt: new Date() },
    });

    const processed = await this.processEmail(email.id, user);
    return { email: processed, idempotent: email.createdAt.getTime() !== email.updatedAt.getTime() };
  }

  async syncConnection(connectionId: string, options: { backfillHours?: number } = {}) {
    const connection = await this.prisma.emailConnection.findUnique({ where: { id: connectionId }, include: { property: true } });
    if (!connection) throw new NotFoundException('Email connection not found');
    if (connection.status === EmailConnectionStatus.DISCONNECTED || connection.provider === EmailProviderType.MANUAL) {
      return { fetched: 0, new_emails: 0, processed: 0, duplicates: 0, reason: 'Manual connections do not support provider sync' };
    }
    if (!connection.encryptedCredential) throw new BadRequestException('Connection has no stored provider credential');

    const provider = this.provider(connection.provider);
    let credential = this.credentialEncryptionService.decrypt<StoredOAuthCredential>(Buffer.from(connection.encryptedCredential));
    try {
      if (credential.expires_at && credential.expires_at < Date.now() + 120_000) {
        credential = await provider.refreshCredential(credential);
        await this.prisma.emailConnection.update({
          where: { id: connection.id },
          data: {
            encryptedCredential: this.credentialEncryptionService.encrypt(credential),
            grantedScopes: credential.scope,
          },
        });
      }

      const cursor = options.backfillHours
        ? new Date(Date.now() - options.backfillHours * 60 * 60_000).toISOString()
        : connection.providerCursor;
      const listed = await provider.listMessageIds(credential, cursor, {
        fromEmail: connection.trustedFromEmail,
        subject: connection.trustedSubject,
      });
      let newEmails = 0;
      let processed = 0;
      let duplicates = 0;
      for (const id of listed.ids.reverse()) {
        const existing = await this.prisma.incomingEmail.findUnique({
          where: {
            connectionId_providerMessageId: {
              connectionId: connection.id,
              providerMessageId: id,
            },
          },
          select: { id: true },
        });
        if (existing) {
          duplicates += 1;
          continue;
        }
        const providerEmail = await provider.fetchMessage(credential, id);
        const email = await this.persistProviderEmail(connection.id, connection.propertyId, connection.property.organizationId, providerEmail);
        await this.processEmail(email.id);
        newEmails += 1;
        processed += 1;
      }
      await this.prisma.emailConnection.update({
        where: { id: connection.id },
        data: {
          status: EmailConnectionStatus.CONNECTED,
          providerCursor: listed.nextCursor,
          lastSyncAt: new Date(),
          lastSuccessAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      return {
        fetched: listed.ids.length,
        new_emails: newEmails,
        processed,
        duplicates,
        backfill_hours: options.backfillHours ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider sync failed';
      await this.prisma.emailConnection.update({
        where: { id: connection.id },
        data: {
          status: this.isAuthError(message) ? EmailConnectionStatus.REAUTH_REQUIRED : EmailConnectionStatus.ERROR,
          lastSyncAt: new Date(),
          lastErrorCode: this.isAuthError(message) ? 'REAUTH_REQUIRED' : 'PROVIDER_SYNC_FAILED',
          lastErrorMessage: message,
        },
      });
      throw error;
    }
  }

  async syncDueConnections() {
    if (this.syncInProgress) return { synced_connections: 0 };
    this.syncInProgress = true;
    try {
      const cutoff = new Date(Date.now() - Math.max(Number(process.env.EMAIL_PROVIDER_SYNC_MIN_AGE_MS ?? 5 * 60_000), 60_000));
      const connections = await this.prisma.emailConnection.findMany({
        where: {
          provider: { in: [EmailProviderType.GMAIL, EmailProviderType.MICROSOFT] },
          status: { in: [EmailConnectionStatus.CONNECTED, EmailConnectionStatus.ERROR, EmailConnectionStatus.RECONNECTING] },
          OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
        },
        orderBy: { lastSyncAt: 'asc' },
        take: Math.max(Number(process.env.EMAIL_PROVIDER_SYNC_BATCH_SIZE ?? 5), 1),
      });
      let syncedConnections = 0;
      for (const connection of connections) {
        try {
          await this.prisma.emailConnection.update({ where: { id: connection.id }, data: { status: EmailConnectionStatus.RECONNECTING } });
          await this.syncConnection(connection.id);
          syncedConnections += 1;
        } catch (error) {
          this.logger.warn(JSON.stringify({ connection_id: connection.id, message: error instanceof Error ? error.message : 'Sync failed' }));
        }
      }
      return { synced_connections: syncedConnections };
    } finally {
      this.syncInProgress = false;
    }
  }

  async reprocess(propertyId: string, emailId: string, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const email = await this.prisma.incomingEmail.findFirst({ where: { id: emailId, propertyId } });
    if (!email) throw new NotFoundException('Incoming email not found');
    return this.processEmail(email.id, user);
  }

  async applyPayoutPayment(propertyId: string, emailId: string, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const email = await this.prisma.incomingEmail.findFirst({
      where: { id: emailId, propertyId },
      include: { extraction: true, attachments: true },
    });
    if (!email) throw new NotFoundException('Incoming email not found');
    if (email.extraction?.category !== EmailCategory.PAYMENT_NOTIFICATION) {
      throw new ConflictException('Only payment notification emails can update payments');
    }

    const payoutAmount = email.extraction.totalAmount ? new Prisma.Decimal(email.extraction.totalAmount) : null;
    const taxWithholding = this.rawFinancialNumber(email.extraction.rawStructuredJson, 'taxWithholding');
    const airbnbPayoutBeforeTax = this.rawFinancialNumber(email.extraction.rawStructuredJson, 'hostPayout');
    const settlementAmount = payoutAmount;
    if (!settlementAmount || settlementAmount.lte(0)) throw new ConflictException('No payout amount detected on this email');

    const paymentReference = `AIRBNB-PAYOUT-${email.id.slice(0, 8)}`;
    const existingPayment = await this.prisma.paymentTransaction.findFirst({
      where: { providerReference: paymentReference },
      include: { billing: { include: { reservationRoom: { include: { reservationGroup: true } } } } },
    });
    if (existingPayment) {
      const normalizedPayment = await this.prisma.$transaction(async (tx) => {
        const payment = await tx.paymentTransaction.update({
          where: { id: existingPayment.id },
          data: {
            amount: settlementAmount,
            metadata: this.toInputJson({
              source: 'airbnb_payout_email',
              incoming_email_id: email.id,
              net_received: payoutAmount?.toNumber() ?? null,
              airbnb_payout_before_tax: airbnbPayoutBeforeTax ?? null,
              tax_withholding: taxWithholding ?? null,
              external_reservation_id: existingPayment.billing.reservationRoom?.reservationGroup.externalReservationId ?? null,
            }),
          },
        });
        const billing = await tx.billing.update({
          where: { id: existingPayment.billingId },
          data: { paymentStatus: PaymentStatus.PAID },
        });
        return { payment, billing };
      });
      return {
        already_applied: true,
        payment_id: normalizedPayment.payment.id,
        billing_id: normalizedPayment.payment.billingId,
        reservation_group_id: existingPayment.billing.reservationRoom?.reservationGroupId ?? null,
        external_reservation_id: existingPayment.billing.reservationRoom?.reservationGroup.externalReservationId ?? null,
        guest_name: existingPayment.billing.reservationRoom?.guestName ?? null,
        amount: normalizedPayment.payment.amount.toNumber(),
        payment_status: normalizedPayment.billing.paymentStatus,
      };
    }

    const match = await this.findPayoutReservationGroup(propertyId, email.extraction);
    if (!match) throw new NotFoundException('No matching reservation found for this payout email');

    const result = await this.prisma.$transaction(async (tx) => {
      const group = await tx.reservationGroup.findUnique({
        where: { id: match.id },
        include: {
          primaryGuest: true,
          rooms: {
            include: { billings: { include: { payments: true } } },
            orderBy: [{ departureDate: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
      if (!group) throw new NotFoundException('Reservation not found');

      const openBillings = group.rooms.flatMap((room) =>
        room.billings
          .map((billing) => {
            const paidTotal = this.sumPayments(billing.payments, PaymentTransactionStatus.SUCCEEDED);
            const refundedTotal = this.sumPayments(billing.payments, PaymentTransactionStatus.REFUNDED);
            return { billing, paidTotal, remaining: billing.total.sub(paidTotal).add(refundedTotal) };
          })
          .filter((entry) => entry.remaining.gt(0)),
      );
      if (openBillings.length === 0) throw new ConflictException('Matching reservation is already paid');

      let remainingSettlement = settlementAmount;
      const payments: Array<{ paymentId: string; billingId: string; amount: Prisma.Decimal }> = [];
      for (const [index, entry] of openBillings.entries()) {
        if (remainingSettlement.lte(0)) break;
        const allocation = remainingSettlement.lessThan(entry.remaining) ? remainingSettlement : entry.remaining;
        const payment = await tx.paymentTransaction.create({
          data: {
            billingId: entry.billing.id,
            amount: allocation,
            provider: PaymentProvider.MOCK,
            providerReference: index === 0 ? paymentReference : `${paymentReference}-${index + 1}`,
            status: PaymentTransactionStatus.SUCCEEDED,
            metadata: this.toInputJson({
              source: 'airbnb_payout_email',
              incoming_email_id: email.id,
              net_received: payoutAmount?.toNumber() ?? null,
              airbnb_payout_before_tax: airbnbPayoutBeforeTax ?? null,
              tax_withholding: taxWithholding ?? null,
              external_reservation_id: group.externalReservationId,
            }),
          },
        });
        const newPaidTotal = entry.paidTotal.add(allocation);
        await tx.billing.update({
          where: { id: entry.billing.id },
          data: { paymentStatus: PaymentStatus.PAID },
        });
        payments.push({ paymentId: payment.id, billingId: entry.billing.id, amount: allocation });
        remainingSettlement = remainingSettlement.sub(allocation);
      }

      await tx.incomingEmail.update({
        where: { id: email.id },
        data: {
          status: IncomingEmailStatus.PROCESSED,
          automationDecision: AutomationDecision.UPDATE_RESERVATION,
          reservationId: group.id,
        },
      });

      return {
        propertyId: group.propertyId,
        reservationGroupId: group.id,
        externalReservationId: group.externalReservationId,
        guestName: group.primaryGuest?.name ?? group.rooms[0]?.guestName ?? null,
        allocatedTotal: payments.reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0)),
        payments,
      };
    });

    await this.auditLogService.record({
      action: AuditAction.PAYMENT_COLLECT,
      entityType: 'reservation_group',
      entityId: result.reservationGroupId,
      propertyId: result.propertyId,
      summary: `Applied Airbnb payout payment for ${result.guestName ?? result.externalReservationId}`,
      metadata: this.toInputJson({
        incoming_email_id: email.id,
        external_reservation_id: result.externalReservationId,
        allocated_total: result.allocatedTotal.toNumber(),
      }),
      user,
    });

    return {
      already_applied: false,
      reservation_group_id: result.reservationGroupId,
      external_reservation_id: result.externalReservationId,
      guest_name: result.guestName,
      allocated_total: result.allocatedTotal.toNumber(),
      payments: result.payments.map((payment) => ({
        payment_id: payment.paymentId,
        billing_id: payment.billingId,
        amount: payment.amount.toNumber(),
      })),
    };
  }

  async processEmail(emailId: string, user?: AuthenticatedUser) {
    const email = await this.prisma.incomingEmail.update({
      where: { id: emailId },
      data: {
        status: IncomingEmailStatus.PROCESSING,
        processingAttempts: { increment: 1 },
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      include: { connection: true, property: true, attachments: true },
    });

    try {
      const normalized: NormalizedProviderEmail = {
        providerMessageId: email.providerMessageId,
        providerThreadId: email.providerThreadId ?? undefined,
        internetMessageId: email.internetMessageId ?? undefined,
        from: { email: email.fromEmail, name: email.fromName ?? undefined },
        to: [],
        cc: [],
        subject: email.subject,
        receivedAt: email.receivedAt,
        sentAt: email.sentAt ?? undefined,
        plainText: email.plainText ?? undefined,
        attachments: email.attachments.map((attachment) => ({
          providerAttachmentId: attachment.providerAttachmentId ?? undefined,
          fileName: attachment.fileName ?? undefined,
          mimeType: attachment.mimeType ?? undefined,
          sizeBytes: attachment.sizeBytes ?? undefined,
          sha256: attachment.sha256 ?? undefined,
        })),
        headers: {},
      };
      const parsed = await this.parserRegistry.parse(normalized);
      this.validateParsedEvent(parsed);
      const resolution = await this.resolver.resolve(email.propertyId, parsed);
      const decision = this.policy.decide(parsed, resolution);
      const result = await this.applyDecision(email.id, parsed, decision.decision, resolution, user);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email processing failed';
      return this.prisma.incomingEmail.update({
        where: { id: emailId },
        data: {
          status: IncomingEmailStatus.FAILED,
          lastErrorCode: 'PROCESSING_FAILED',
          lastErrorMessage: message,
        },
        include: { extraction: true, attachments: true },
      }).then((failed) => this.toEmailResponse(failed));
    }
  }

  async getSummary(propertyId: string, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const [connections, grouped, enquiries] = await Promise.all([
      this.prisma.emailConnection.findMany({ where: { propertyId }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.incomingEmail.groupBy({
        by: ['status', 'automationDecision'],
        where: { propertyId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.bookingEnquiry.count({ where: { propertyId, createdAt: { gte: since } } }),
    ]);

    return {
      connected: connections.some((connection) => connection.status === EmailConnectionStatus.CONNECTED),
      connection: connections[0] ? {
        email_address: connections[0].emailAddress,
        provider: connections[0].provider,
        status: connections[0].status,
        last_sync_at: connections[0].lastSyncAt?.toISOString() ?? null,
      } : null,
      today: {
        emails_processed: this.countStatus(grouped, IncomingEmailStatus.PROCESSED) + this.countStatus(grouped, IncomingEmailStatus.NEEDS_REVIEW) + this.countStatus(grouped, IncomingEmailStatus.IGNORED),
        reservations_created: this.countDecision(grouped, AutomationDecision.CREATE_RESERVATION),
        reservations_updated: this.countDecision(grouped, AutomationDecision.UPDATE_RESERVATION),
        cancellations_processed: this.countDecision(grouped, AutomationDecision.CANCEL_RESERVATION),
        enquiries_created: enquiries,
        needs_review: this.countStatus(grouped, IncomingEmailStatus.NEEDS_REVIEW),
        ignored: this.countStatus(grouped, IncomingEmailStatus.IGNORED),
      },
    };
  }

  async listActivity(propertyId: string, query: EmailActivityQueryDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const { page, limit, skip, take } = paginationParams(query);
    const search = query.search?.trim();
    const usefulEmailFilters: Prisma.IncomingEmailWhereInput[] = [
      {
        extraction: {
          is: {
            category: EmailCategory.BOOKING_CONFIRMATION,
            OR: [
              { externalReservationId: { not: null } },
              { guestName: { not: null } },
              { checkIn: { not: null } },
              { checkOut: { not: null } },
            ],
          },
        },
      },
      {
        extraction: {
          is: {
            category: EmailCategory.PAYMENT_NOTIFICATION,
            OR: [
              { totalAmount: { not: null } },
              { taxAmount: { not: null } },
              { externalReservationId: { not: null } },
              { guestName: { not: null } },
            ],
          },
        },
      },
    ];
    const searchFilter: Prisma.IncomingEmailWhereInput | null = search ? {
      OR: [
        { subject: { contains: search, mode: 'insensitive' } },
        { fromEmail: { contains: search, mode: 'insensitive' } },
        { extraction: { externalReservationId: { contains: search, mode: 'insensitive' } } },
        { extraction: { guestName: { contains: search, mode: 'insensitive' } } },
      ],
    } : null;
    const where: Prisma.IncomingEmailWhereInput = {
      propertyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.connection_id ? { connectionId: query.connection_id } : {}),
      AND: [
        { OR: usefulEmailFilters },
        ...(searchFilter ? [searchFilter] : []),
      ],
    };
    const [emails, total] = await this.prisma.$transaction([
      this.prisma.incomingEmail.findMany({
        where,
        include: { extraction: true, attachments: true },
        orderBy: { receivedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.incomingEmail.count({ where }),
    ]);
    return paginatedResponse(emails.map((email) => this.toEmailResponse(email)), total, page, limit);
  }

  async getEmail(propertyId: string, emailId: string, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const email = await this.prisma.incomingEmail.findFirst({
      where: { id: emailId, propertyId },
      include: { extraction: true, attachments: true },
    });
    if (!email) throw new NotFoundException('Incoming email not found');
    return this.toEmailResponse(email, true);
  }

  async review(propertyId: string, emailId: string, dto: ReviewEmailDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const email = await this.prisma.incomingEmail.findFirst({ where: { id: emailId, propertyId }, include: { extraction: true } });
    if (!email) throw new NotFoundException('Incoming email not found');
    const parsed = this.mergeCorrections(email.extraction, dto);
    const resolution = await this.resolver.resolve(propertyId, parsed);
    const updated = await this.applyDecision(emailId, parsed, dto.action, resolution, user);
    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'incoming_email',
      entityId: emailId,
      propertyId,
      summary: `Reviewed email with action ${dto.action}`,
      metadata: this.toInputJson({ action: dto.action, corrections: dto.corrections ?? null }),
      user,
    });
    return updated;
  }

  private async applyDecision(
    emailId: string,
    parsed: ParsedEmailEvent,
    action: AutomationDecision,
    resolution: Awaited<ReturnType<EmailReservationResolverService['resolve']>>,
    user?: AuthenticatedUser,
  ) {
    const status =
      action === AutomationDecision.IGNORE ? IncomingEmailStatus.IGNORED :
      action === AutomationDecision.REVIEW ? IncomingEmailStatus.NEEDS_REVIEW :
      IncomingEmailStatus.PROCESSED;
    let reservationId: string | null = resolution.type === 'EXISTING' ? resolution.reservationId : null;
    let enquiryId: string | null = null;

    if (action === AutomationDecision.CREATE_ENQUIRY) {
      enquiryId = await this.createEnquiry(emailId, parsed);
    }

    if (action === AutomationDecision.CREATE_RESERVATION) {
      if (resolution.type === 'EXISTING') {
        reservationId = resolution.reservationId;
      } else {
        reservationId = await this.createReservationFromEmail(emailId, parsed, user);
      }
    }

    if (action === AutomationDecision.CANCEL_RESERVATION) {
      if (resolution.type !== 'EXISTING') throw new ConflictException('Cancellation requires a matching reservation');
      reservationId = await this.cancelReservation(resolution.reservationId, emailId, parsed, user);
    }

    const updated = await this.prisma.incomingEmail.update({
      where: { id: emailId },
      data: {
        status,
        detectedSource: parsed.source,
        detectedCategory: parsed.category,
        classificationConfidence: parsed.confidence,
        parserType: parsed.parserType,
        parserVersion: parsed.parserVersion,
        automationDecision: action,
        reservationId,
        enquiryId,
        extraction: {
          upsert: {
            create: this.extractionData(parsed),
            update: this.extractionData(parsed),
          },
        },
      },
      include: { extraction: true, attachments: true },
    });

    return this.toEmailResponse(updated);
  }

  private async persistProviderEmail(
    connectionId: string,
    propertyId: string,
    tenantId: string | null,
    normalized: NormalizedProviderEmail,
  ) {
    return this.prisma.incomingEmail.upsert({
      where: {
        connectionId_providerMessageId: {
          connectionId,
          providerMessageId: normalized.providerMessageId,
        },
      },
      create: {
        tenantId,
        propertyId,
        connectionId,
        providerMessageId: normalized.providerMessageId,
        providerThreadId: normalized.providerThreadId,
        internetMessageId: normalized.internetMessageId,
        fromEmail: normalized.from.email.toLowerCase(),
        fromName: normalized.from.name,
        subject: normalized.subject.slice(0, 300),
        receivedAt: normalized.receivedAt,
        sentAt: normalized.sentAt,
        plainText: normalized.plainText?.slice(0, 100_000),
        status: IncomingEmailStatus.RECEIVED,
        attachments: {
          create: normalized.attachments.map((attachment) => ({
            providerAttachmentId: attachment.providerAttachmentId,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            sha256: attachment.sha256,
            processingStatus: 'METADATA_ONLY',
          })),
        },
      },
      update: {},
    });
  }

  private async createEnquiry(emailId: string, parsed: ParsedEmailEvent) {
    const email = await this.prisma.incomingEmail.findUniqueOrThrow({ where: { id: emailId }, include: { property: true } });
    const enquiry = await this.prisma.bookingEnquiry.upsert({
      where: { incomingEmailId: emailId },
      create: {
        tenantId: email.property.organizationId,
        propertyId: email.propertyId,
        source: 'EMAIL',
        guestName: parsed.guest?.name ?? null,
        guestEmail: parsed.guest?.email ?? email.fromEmail,
        guestPhoneE164: parsed.guest?.phoneE164 ?? null,
        checkIn: parsed.stay?.checkIn ? this.parseDateOnly(parsed.stay.checkIn) : null,
        checkOut: parsed.stay?.checkOut ? this.parseDateOnly(parsed.stay.checkOut) : null,
        adults: parsed.stay?.adults ?? null,
        children: parsed.stay?.children ?? null,
        incomingEmailId: emailId,
      },
      update: {
        guestName: parsed.guest?.name ?? null,
        guestEmail: parsed.guest?.email ?? email.fromEmail,
        guestPhoneE164: parsed.guest?.phoneE164 ?? null,
        checkIn: parsed.stay?.checkIn ? this.parseDateOnly(parsed.stay.checkIn) : null,
        checkOut: parsed.stay?.checkOut ? this.parseDateOnly(parsed.stay.checkOut) : null,
        adults: parsed.stay?.adults ?? null,
        children: parsed.stay?.children ?? null,
      },
    });
    return enquiry.id;
  }

  private async createReservationFromEmail(emailId: string, parsed: ParsedEmailEvent, user?: AuthenticatedUser) {
    if (parsed.category !== EmailCategory.BOOKING_CONFIRMATION) {
      throw new ConflictException('Only booking confirmation emails can create reservations');
    }
    if (!parsed.externalReservationId || !parsed.stay?.checkIn || !parsed.stay?.checkOut) {
      throw new ConflictException('Reservation creation requires reservation ID, check-in, and check-out');
    }
    const externalReservationId = parsed.externalReservationId;
    const stay = parsed.stay;
    const checkIn = stay.checkIn as string;
    const checkOut = stay.checkOut as string;

    const email = await this.prisma.incomingEmail.findUniqueOrThrow({
      where: { id: emailId },
      include: { property: true },
    });
    const checkInDate = this.parseDateOnly(checkIn);
    const checkOutDate = this.parseDateOnly(checkOut);
    if (checkOutDate <= checkInDate) {
      throw new ConflictException('check_out must be after check_in');
    }

    const reservation = await this.prisma.$transaction(async (tx) => {
      const roomCategory = await tx.roomCategory.findFirst({
        where: { propertyId: email.propertyId },
        orderBy: { createdAt: 'asc' },
      });
      if (!roomCategory) throw new ConflictException('No room type is configured for this property');

      const ratePlan = await tx.ratePlan.findFirst({
        where: { propertyId: email.propertyId, roomCategoryId: roomCategory.id, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!ratePlan) throw new ConflictException('No active rate plan is configured for this property');

      await this.inventoryService.allocateInventory(tx, {
        propertyId: email.propertyId,
        roomCategoryId: roomCategory.id,
        checkInDate,
        checkOutDate,
        roomCount: 1,
      });

      const guest = await this.resolveEmailGuest(tx, email.propertyId, parsed, email.fromEmail);
      const source = this.emailSourceLabel(parsed.source);
      const totalAmount = parsed.financial?.total != null ? new Prisma.Decimal(parsed.financial.total) : null;
      const roomFeeAmount = parsed.financial?.roomFee != null ? new Prisma.Decimal(parsed.financial.roomFee) : totalAmount;
      const taxAmount = parsed.financial?.tax != null ? new Prisma.Decimal(parsed.financial.tax) : new Prisma.Decimal(0);
      const currency = parsed.financial?.currency ?? ratePlan.currency;

      const group = await tx.reservationGroup.create({
        data: {
          propertyId: email.propertyId,
          primaryGuestId: guest.id,
          externalReservationId,
          externalReservationVersion: 'email',
          externalStatus: 'CONFIRMED',
          source,
          currency,
          totalAmount,
          status: BookingStatus.BOOKED,
          remarks: `Created from email ${email.subject}`.slice(0, 1000),
          bookedAt: email.receivedAt,
          modifiedAt: new Date(),
          rawPayload: this.toInputJson({
            mode: 'email_automation',
            incoming_email_id: emailId,
            parser: parsed.parserVersion,
            source: parsed.source,
            financial: parsed.financial ?? null,
          }),
        },
      });

      const reservationRoom = await tx.reservationRoom.create({
        data: {
          reservationGroupId: group.id,
          propertyId: email.propertyId,
          externalRoomReservationId: `${externalReservationId}-1`,
          externalRoomId: parsed.room?.externalName ?? `EMAIL:${roomCategory.code}`,
          roomCategoryId: roomCategory.id,
          ratePlanId: ratePlan.id,
          arrivalDate: checkInDate,
          departureDate: checkOutDate,
          totalAmount,
          currency,
          status: BookingStatus.BOOKED,
          guestName: guest.name,
          adults: stay.adults ?? 1,
          children: stay.children ?? 0,
          rawPayload: this.toInputJson({
            mode: 'email_automation_room',
            incoming_email_id: emailId,
            external_room_name: parsed.room?.externalName ?? null,
            external_rate_plan_name: parsed.room?.externalRatePlanName ?? null,
            financial: parsed.financial ?? null,
          }),
        },
      });

      if (totalAmount) {
        await tx.billing.create({
          data: {
            reservationRoomId: reservationRoom.id,
            amount: roomFeeAmount ?? totalAmount,
            tax: taxAmount,
            total: totalAmount,
            paymentStatus: PaymentStatus.PENDING,
          },
        });
      }

      return group;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditLogService.record({
      action: AuditAction.CREATE,
      entityType: 'reservation_group',
      entityId: reservation.id,
      propertyId: reservation.propertyId,
      summary: `Created reservation ${reservation.externalReservationId} from email automation`,
      metadata: { incoming_email_id: emailId, parser: parsed.parserVersion, source: parsed.source },
      user,
    });
    await this.backgroundJobService.queueInventorySyncsForProperty(reservation.propertyId, { trigger: 'email_reservation_created' });
    return reservation.id;
  }

  private async resolveEmailGuest(
    tx: Prisma.TransactionClient,
    propertyId: string,
    parsed: ParsedEmailEvent,
    fallbackEmail: string,
  ) {
    const email = (parsed.guest?.email ?? fallbackEmail).toLowerCase();
    const existing = await tx.guest.findFirst({
      where: { propertyId, email },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) {
      return tx.guest.update({
        where: { id: existing.id },
        data: {
          name: parsed.guest?.name?.trim() || existing.name,
          phone: parsed.guest?.phoneE164 ?? parsed.guest?.phoneRaw ?? existing.phone,
        },
      });
    }

    return tx.guest.create({
      data: {
        propertyId,
        name: parsed.guest?.name?.trim() || email.split('@')[0] || 'Email guest',
        phone: parsed.guest?.phoneE164 ?? parsed.guest?.phoneRaw ?? 'Unavailable',
        email,
        idProof: 'Passport: EMAIL-AUTOMATION-PENDING',
        address: 'Captured from email automation',
      },
    });
  }

  private async cancelReservation(reservationId: string, emailId: string, parsed: ParsedEmailEvent, user?: AuthenticatedUser) {
    const group = await this.prisma.reservationGroup.findUnique({
      where: { id: reservationId },
      include: { rooms: true },
    });
    if (!group) throw new NotFoundException('Reservation not found');
    if (group.status === BookingStatus.CANCELLED) return group.id;
    if (group.source && !String(group.source).toUpperCase().includes('EMAIL') && !String(group.source).toUpperCase().includes(String(parsed.source))) {
      throw new ConflictException('Reservation was created by a stronger source and requires manual cancellation review');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const room of group.rooms.filter((room) => room.status !== BookingStatus.CANCELLED)) {
        await this.inventoryService.releaseInventory(tx, {
          propertyId: room.propertyId,
          roomCategoryId: room.roomCategoryId,
          checkInDate: room.arrivalDate,
          checkOutDate: room.departureDate,
          roomCount: 1,
        });
      }
      await tx.reservationRoom.updateMany({
        where: { reservationGroupId: group.id },
        data: { status: BookingStatus.CANCELLED },
      });
      await tx.reservationGroup.update({
        where: { id: group.id },
        data: {
          status: BookingStatus.CANCELLED,
          externalStatus: 'CANCELLED',
          modifiedAt: new Date(),
          rawPayload: {
            ...(this.objectJson(group.rawPayload)),
            email_cancellation: { incoming_email_id: emailId, reason: parsed.cancellation?.reason ?? null },
          },
        },
      });
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'reservation_group',
      entityId: group.id,
      propertyId: group.propertyId,
      summary: `Cancelled reservation ${group.externalReservationId} from email automation`,
      metadata: { incoming_email_id: emailId, parser: parsed.parserVersion },
      user,
    });
    await this.backgroundJobService.queueInventorySyncsForProperty(group.propertyId, { trigger: 'email_reservation_cancelled' });
    return group.id;
  }

  private async findPayoutReservationGroup(propertyId: string, extraction: Prisma.EmailExtractionGetPayload<object>) {
    if (extraction.externalReservationId) {
      const exact = await this.prisma.reservationGroup.findFirst({
        where: { propertyId, externalReservationId: extraction.externalReservationId },
        select: { id: true },
      });
      if (exact) return exact;
    }

    const guestName = extraction.guestName?.trim();
    if (!guestName && !extraction.checkIn && !extraction.checkOut) return null;

    return this.prisma.reservationGroup.findFirst({
      where: {
        propertyId,
        ...(guestName ? {
          OR: [
            { primaryGuest: { name: { contains: guestName, mode: 'insensitive' } } },
            { rooms: { some: { guestName: { contains: guestName, mode: 'insensitive' } } } },
          ],
        } : {}),
        rooms: {
          some: {
            ...(extraction.checkIn ? { arrivalDate: extraction.checkIn } : {}),
            ...(extraction.checkOut ? { departureDate: extraction.checkOut } : {}),
            billings: { some: { paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
  }

  private sumPayments(payments: Array<{ amount: Prisma.Decimal; status: PaymentTransactionStatus }>, status: PaymentTransactionStatus) {
    return payments
      .filter((payment) => payment.status === status)
      .reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0));
  }

  private validateParsedEvent(parsed: ParsedEmailEvent) {
    if (parsed.confidence < 0 || parsed.confidence > 1) throw new BadRequestException('Parser confidence must be between 0 and 1');
    if (parsed.stay?.checkIn && parsed.stay?.checkOut && this.parseDateOnly(parsed.stay.checkOut) <= this.parseDateOnly(parsed.stay.checkIn)) {
      throw new BadRequestException('check_out must be after check_in');
    }
    if (parsed.financial?.total != null && parsed.financial.total < 0) throw new BadRequestException('Amount must not be negative');
  }

  private extractionData(parsed: ParsedEmailEvent): Prisma.EmailExtractionCreateWithoutEmailInput {
    return {
      source: parsed.source,
      category: parsed.category,
      confidence: parsed.confidence,
      externalReservationId: parsed.externalReservationId ?? null,
      guestName: parsed.guest?.name ?? null,
      guestEmail: parsed.guest?.email ?? null,
      guestPhoneRaw: parsed.guest?.phoneRaw ?? null,
      guestPhoneE164: parsed.guest?.phoneE164 ?? null,
      checkIn: parsed.stay?.checkIn ? this.parseDateOnly(parsed.stay.checkIn) : null,
      checkOut: parsed.stay?.checkOut ? this.parseDateOnly(parsed.stay.checkOut) : null,
      adults: parsed.stay?.adults ?? null,
      children: parsed.stay?.children ?? null,
      infants: parsed.stay?.infants ?? null,
      externalRoomName: parsed.room?.externalName ?? null,
      externalRatePlanName: parsed.room?.externalRatePlanName ?? null,
      currency: parsed.financial?.currency ?? null,
      totalAmount: parsed.financial?.total != null ? new Prisma.Decimal(parsed.financial.total) : null,
      taxAmount: parsed.financial?.tax != null ? new Prisma.Decimal(parsed.financial.tax) : null,
      cancellationReason: parsed.cancellation?.reason ?? null,
      rawStructuredJson: this.toInputJson(parsed),
    };
  }

  private mergeCorrections(extraction: Prisma.EmailExtractionGetPayload<object> | null, dto: ReviewEmailDto): ParsedEmailEvent {
    if (!extraction) throw new ConflictException('Email has no extraction to review');
    return {
      source: extraction.source,
      category: extraction.category,
      confidence: extraction.confidence,
      parserType: ParserType.MANUAL,
      parserVersion: 'manual-review@1',
      externalReservationId: extraction.externalReservationId,
      guest: {
        name: dto.corrections?.guest_name ?? extraction.guestName,
        email: dto.corrections?.guest_email ?? extraction.guestEmail,
        phoneRaw: dto.corrections?.guest_phone ?? extraction.guestPhoneRaw,
        phoneE164: extraction.guestPhoneE164,
      },
      stay: {
        checkIn: dto.corrections?.check_in ?? this.formatDateOnly(extraction.checkIn),
        checkOut: dto.corrections?.check_out ?? this.formatDateOnly(extraction.checkOut),
        adults: dto.corrections?.adults ?? extraction.adults,
        children: dto.corrections?.children ?? extraction.children,
        infants: extraction.infants,
      },
      room: {
        externalName: extraction.externalRoomName,
        externalRatePlanName: extraction.externalRatePlanName,
      },
      financial: {
        currency: extraction.currency,
        total: extraction.totalAmount ? Number(extraction.totalAmount) : null,
        tax: extraction.taxAmount ? Number(extraction.taxAmount) : null,
        roomFee: this.rawFinancialNumber(extraction.rawStructuredJson, 'roomFee'),
        guestServiceFee: this.rawFinancialNumber(extraction.rawStructuredJson, 'guestServiceFee'),
        occupancyTaxes: this.rawFinancialNumber(extraction.rawStructuredJson, 'occupancyTaxes'),
        hostServiceFee: this.rawFinancialNumber(extraction.rawStructuredJson, 'hostServiceFee'),
        hostPayout: this.rawFinancialNumber(extraction.rawStructuredJson, 'hostPayout'),
        payoutAmount: this.rawFinancialNumber(extraction.rawStructuredJson, 'payoutAmount'),
        payoutSentDate: this.rawFinancialString(extraction.rawStructuredJson, 'payoutSentDate'),
        payoutArrivalDate: this.rawFinancialString(extraction.rawStructuredJson, 'payoutArrivalDate'),
        bankAccount: this.rawFinancialString(extraction.rawStructuredJson, 'bankAccount'),
        airbnbAccountId: this.rawFinancialString(extraction.rawStructuredJson, 'airbnbAccountId'),
        taxWithholding: this.rawFinancialNumber(extraction.rawStructuredJson, 'taxWithholding'),
      },
      cancellation: {
        reason: extraction.cancellationReason,
      },
    };
  }

  private countStatus(rows: Array<{ status: IncomingEmailStatus; _count: { _all: number } }>, status: IncomingEmailStatus) {
    return rows.filter((row) => row.status === status).reduce((sum, row) => sum + row._count._all, 0);
  }

  private countDecision(rows: Array<{ automationDecision: AutomationDecision | null; _count: { _all: number } }>, decision: AutomationDecision) {
    return rows.filter((row) => row.automationDecision === decision).reduce((sum, row) => sum + row._count._all, 0);
  }

  private parseDateOnly(value: string) {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }

  private formatDateOnly(date?: Date | null) {
    return date ? date.toISOString().slice(0, 10) : null;
  }

  private toEmailResponse(email: Prisma.IncomingEmailGetPayload<{ include: { extraction: true; attachments: true } }>, includeBody = false) {
    return {
      id: email.id,
      property_id: email.propertyId,
      connection_id: email.connectionId,
      provider_message_id: email.providerMessageId,
      provider_thread_id: email.providerThreadId,
      internet_message_id: email.internetMessageId,
      from_email: email.fromEmail,
      from_name: email.fromName,
      subject: email.subject,
      received_at: email.receivedAt.toISOString(),
      sent_at: email.sentAt?.toISOString() ?? null,
      plain_text: includeBody ? email.plainText : undefined,
      status: email.status,
      detected_source: email.detectedSource,
      detected_category: email.detectedCategory,
      classification_confidence: email.classificationConfidence,
      parser_type: email.parserType,
      parser_version: email.parserVersion,
      automation_decision: email.automationDecision,
      reservation_id: email.reservationId,
      enquiry_id: email.enquiryId,
      processing_attempts: email.processingAttempts,
      last_error_code: email.lastErrorCode,
      last_error_message: email.lastErrorMessage,
      extraction: email.extraction ? {
        source: email.extraction.source,
        category: email.extraction.category,
        confidence: email.extraction.confidence,
        external_reservation_id: email.extraction.externalReservationId,
        guest_name: email.extraction.guestName,
        guest_email: email.extraction.guestEmail,
        guest_phone_raw: email.extraction.guestPhoneRaw,
        guest_phone_e164: email.extraction.guestPhoneE164,
        check_in: this.formatDateOnly(email.extraction.checkIn),
        check_out: this.formatDateOnly(email.extraction.checkOut),
        adults: email.extraction.adults,
        children: email.extraction.children,
        external_room_name: email.extraction.externalRoomName,
        currency: email.extraction.currency,
        total_amount: email.extraction.totalAmount ? Number(email.extraction.totalAmount) : null,
        payment_breakdown: {
          room_fee: this.rawFinancialNumber(email.extraction.rawStructuredJson, 'roomFee'),
          guest_service_fee: this.rawFinancialNumber(email.extraction.rawStructuredJson, 'guestServiceFee'),
          occupancy_taxes: this.rawFinancialNumber(email.extraction.rawStructuredJson, 'occupancyTaxes'),
          guest_paid_total: email.extraction.totalAmount ? Number(email.extraction.totalAmount) : null,
          host_service_fee: this.rawFinancialNumber(email.extraction.rawStructuredJson, 'hostServiceFee'),
          host_payout: this.rawFinancialNumber(email.extraction.rawStructuredJson, 'hostPayout'),
          payout_amount: this.rawFinancialNumber(email.extraction.rawStructuredJson, 'payoutAmount'),
          payout_sent_date: this.rawFinancialString(email.extraction.rawStructuredJson, 'payoutSentDate'),
          payout_arrival_date: this.rawFinancialString(email.extraction.rawStructuredJson, 'payoutArrivalDate'),
          bank_account: this.rawFinancialString(email.extraction.rawStructuredJson, 'bankAccount'),
          airbnb_account_id: this.rawFinancialString(email.extraction.rawStructuredJson, 'airbnbAccountId'),
          tax_withholding: this.rawFinancialNumber(email.extraction.rawStructuredJson, 'taxWithholding'),
        },
      } : null,
      attachments: email.attachments.map((attachment) => ({
        id: attachment.id,
        file_name: attachment.fileName,
        mime_type: attachment.mimeType,
        size_bytes: attachment.sizeBytes,
        processing_status: attachment.processingStatus,
      })),
      created_at: email.createdAt.toISOString(),
      updated_at: email.updatedAt.toISOString(),
    };
  }

  private rawFinancialNumber(raw: Prisma.JsonValue | null, key: keyof NonNullable<ParsedEmailEvent['financial']>) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const financial = (raw as { financial?: Record<string, unknown> }).financial;
    const value = financial?.[key];
    return typeof value === 'number' ? value : null;
  }

  private rawFinancialString(raw: Prisma.JsonValue | null, key: keyof NonNullable<ParsedEmailEvent['financial']>) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const financial = (raw as { financial?: Record<string, unknown> }).financial;
    const value = financial?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private toInputJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private objectJson(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private emailSourceLabel(source: EmailSource) {
    const labels: Record<EmailSource, string> = {
      BOOKING_COM: 'BOOKING_COM',
      AIRBNB: 'AIRBNB',
      EXPEDIA: 'EXPEDIA',
      MAKEMYTRIP: 'MAKEMYTRIP',
      GOIBIBO: 'GOIBIBO',
      AGODA: 'AGODA',
      WEBSITE: 'WEBSITE',
      DIRECT_GUEST: 'DIRECT_GUEST',
      OTHER: 'OTHER',
      UNKNOWN: 'EMAIL',
    };
    return labels[source];
  }

  private provider(providerType: EmailProviderType): OAuthEmailProvider {
    if (providerType === EmailProviderType.GMAIL) return this.gmailEmailProvider;
    if (providerType === EmailProviderType.MICROSOFT) return this.microsoftEmailProvider;
    throw new BadRequestException(`Provider ${providerType} does not support automated OAuth sync`);
  }

  private isAuthError(message: string) {
    return /401|403|invalid_grant|unauthorized|forbidden/i.test(message);
  }

  private frontendRedirectUrl() {
    return process.env.EMAIL_AUTOMATION_FRONTEND_REDIRECT_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173';
  }
}
