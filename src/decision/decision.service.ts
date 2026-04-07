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
    eventId: string, action: 'approved' | 'blocked',
    reason: string, moderatorId: string, companyId: string,
    isGlobal: boolean,
    options: { isWildcard?: boolean; category?: string } = {}
  ) {
    // Получаем pending событие
    const pending = await this.domainService.getPendingEvents(companyId);
    const event = pending.find(e => e.id === eventId);
    if (!event) throw new NotFoundException('Событие не найдено');

    // Сохраняем действие модератора в историю
    await this.actionRepo.save(this.actionRepo.create({
      eventId, domain: event.domain, companyId,
      action, reason, moderatorId, isGlobal,
    }));

    // Применяем решение — добавляем в allowlist/blocklist
    const result = await this.domainService.applyModeratorDecision(
      eventId, action, moderatorId, companyId, isGlobal, options
    );

    // Мгновенный WebSocket push диспетчерам
    this.eventsGateway.sendDecisionToDispatchers(companyId, {
      type: 'decision',
      eventId,
      domain: event.domain,
      decision: action === 'approved' ? 'approved' : 'blocked',
      message: action === 'approved' ? 'Одобрено модератором' : 'Заблокировано модератором',
    });

    return result;
  }

  async getEventStatus(eventId: string, companyId: string) {
    // Проверяем в moderator_actions
    const action = await this.actionRepo.findOne({ where: { eventId } });
    if (action) {
      return { eventId, domain: action.domain, decision: action.action, resolved: true };
    }
    // Проверяем pending
    const pending = await this.domainService.getPendingEvents(companyId);
    const stillPending = pending.find(e => e.id === eventId);
    if (stillPending) {
      return { eventId, domain: stillPending.domain, decision: 'pending', resolved: false };
    }
    return { eventId, decision: 'unknown', resolved: true };
  }

  async getHistory(companyId: string) {
    return this.actionRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
