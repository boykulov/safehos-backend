import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModeratorAction } from './decision.entity';
import { DomainService } from '../domain/domain.service';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class DecisionService {
  constructor(
    @InjectRepository(ModeratorAction)
    private actionRepo: Repository<ModeratorAction>,
    private domainService: DomainService,
    private eventsGateway: EventsGateway,
  ) {}

  async makeDecision(
    eventId: string,
    action: 'approved' | 'blocked',
    reason: string,
    moderatorId: string,
    companyId: string,
    isGlobal: boolean,
  ) {
    const pending = await this.domainService.getPendingEvents(companyId);
    const event = pending.find(e => e.id === eventId);

    if (!event) throw new NotFoundException('Событие не найдено');

    const moderatorAction = new ModeratorAction();
    moderatorAction.eventId = eventId;
    moderatorAction.domain = event.domain;
    moderatorAction.companyId = companyId;
    moderatorAction.action = action;
    moderatorAction.reason = reason;
    moderatorAction.moderatorId = moderatorId;
    moderatorAction.isGlobal = isGlobal;
    await this.actionRepo.save(moderatorAction);

    const decision = action === 'approved' ? 'approved' : 'blocked';
    const targetCompanyId = isGlobal ? '' : companyId;

    await this.domainService.saveDomainDecision(
      event.domain,
      targetCompanyId,
      decision,
      event.riskScore,
      reason || `Решение модератора: ${action}`,
      moderatorId,
      isGlobal,
    );

    this.eventsGateway.sendDecisionToDispatchers(companyId, {
      type: 'decision',
      eventId,
      domain: event.domain,
      decision,
      message: reason || `Домен ${action === 'approved' ? 'одобрен' : 'заблокирован'} модератором`,
    });

    return { success: true, eventId, domain: event.domain, decision };
  }

  async getHistory(companyId: string) {
    return this.actionRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
