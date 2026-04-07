import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainDecision } from './domain.entity';
import { LOGISTICS_GLOBAL_ALLOWLIST, GLOBAL_BLOCKLIST_SEEDS } from './logistics-seed';

@Injectable()
export class AllowlistService {
  private readonly logger = new Logger('AllowlistService');

  constructor(
    @InjectRepository(DomainDecision)
    private domainRepo: Repository<DomainDecision>,
  ) {}

  // Проверка домена по всем спискам — главный метод
  async checkDomainPolicy(domain: string, companyId: string): Promise<{
    verdict: 'allow' | 'block' | 'unknown';
    listType: string | null;
    reason: string;
    isWildcard: boolean;
    category: string | null;
  }> {
    const normalizedDomain = this.normalizeDomain(domain);
    const parts = normalizedDomain.split('.');

    // Генерируем все возможные варианты для wildcard проверки
    // example: sub.dat.com → ['sub.dat.com', 'dat.com']
    const domainsToCheck: string[] = [normalizedDomain];
    for (let i = 1; i < parts.length - 1; i++) {
      domainsToCheck.push(parts.slice(i).join('.'));
    }

    // ПРИОРИТЕТ 1: Manual block (org)
    const orgBlock = await this.findInList(domainsToCheck, companyId, ['org_block', 'blocked']);
    if (orgBlock) return { verdict: 'block', listType: 'org_block', reason: orgBlock.reason || 'Org blocklist', isWildcard: orgBlock.isWildcard, category: orgBlock.category };

    // ПРИОРИТЕТ 2: Global block
    const globalBlock = await this.findInList(domainsToCheck, null, ['global_block']);
    if (globalBlock) return { verdict: 'block', listType: 'global_block', reason: globalBlock.reason || 'Global blocklist', isWildcard: globalBlock.isWildcard, category: globalBlock.category };

    // ПРИОРИТЕТ 3: Manual approve (org)
    const orgAllow = await this.findInList(domainsToCheck, companyId, ['org_allow', 'approved']);
    if (orgAllow) return { verdict: 'allow', listType: 'org_allow', reason: orgAllow.reason || 'Org allowlist', isWildcard: orgAllow.isWildcard, category: orgAllow.category };

    // ПРИОРИТЕТ 4: Global allowlist
    const globalAllow = await this.findInList(domainsToCheck, null, ['global_allow']);
    if (globalAllow) return { verdict: 'allow', listType: 'global_allow', reason: globalAllow.notes || globalAllow.reason || 'Global allowlist', isWildcard: globalAllow.isWildcard, category: globalAllow.category };

    return { verdict: 'unknown', listType: null, reason: 'Domain not in any list', isWildcard: false, category: null };
  }

  private async findInList(
    domains: string[], companyId: string | null, listTypes: string[]
  ): Promise<DomainDecision | null> {
    // domains[0] — точный домен, domains[1+] — родительские домены
    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      const isParentDomain = i > 0; // это родительский домен (проверяем поддомен)

      let query = this.domainRepo.createQueryBuilder('d')
        .where('d.domain = :domain', { domain })
        .andWhere('d.listType IN (:...listTypes)', { listTypes });

      if (companyId) {
        query = query.andWhere('(d.companyId = :companyId OR d.isGlobal = 1)', { companyId });
      } else {
        query = query.andWhere('(d.isGlobal = 1 OR d.companyId IS NULL)');
      }

      // Если проверяем поддомен через родительский домен —
      // разрешаем ТОЛЬКО если у родителя isWildcard = true
      if (isParentDomain) {
        query = query.andWhere('d.isWildcard = 1');
      }

      const result = await query.getOne();
      if (result) return result;
    }
    return null;
  }

  normalizeDomain(input: string): string {
    if (!input) return '';
    try {
      const str = String(input).trim();
      const url = str.startsWith('http') ? str : `https://${str}`;
      let hostname = new URL(url).hostname;
      if (hostname.startsWith('www.')) hostname = hostname.slice(4);
      return hostname.toLowerCase();
    } catch {
      return String(input).trim().toLowerCase();
    }
  }

  // Добавить домен в allowlist
  async addToAllowlist(domain: string, companyId: string | null, isGlobal: boolean, moderatorId: string, options: {
    isWildcard?: boolean;
    category?: string;
    notes?: string;
    reason?: string;
  } = {}): Promise<DomainDecision> {
    const normalized = this.normalizeDomain(domain);
    const listType = isGlobal ? 'global_allow' : 'org_allow';

    // Проверяем конфликт с blocklist
    const inBlocklist = await this.domainRepo
      .createQueryBuilder('d')
      .where('d.domain = :domain', { domain: normalized })
      .andWhere('d.listType IN (:...types)', { types: ['org_block', 'global_block'] })
      .getOne();
    if (inBlocklist) {
      throw new Error(`CONFLICT: Domain "${normalized}" is in blocklist (${inBlocklist.listType}). Remove it from blocklist first.`);
    }
    
    // Проверяем конфликт — если уже в allowlist другого типа
    const existingAllow = await this.domainRepo
      .createQueryBuilder('d')
      .where('d.domain = :domain', { domain: normalized })
      .andWhere('d.listType IN (:...types)', { types: ['org_allow', 'global_allow'] })
      .getOne();
    if (existingAllow && existingAllow.listType !== listType) {
      // Уже существует в другом типе allowlist — обновляем вместо создания нового
      existingAllow.listType = listType;
      existingAllow.isGlobal = isGlobal;
      existingAllow.isWildcard = options.isWildcard ?? existingAllow.isWildcard;
      existingAllow.category = options.category || existingAllow.category;
      existingAllow.notes = options.notes || existingAllow.notes;
      existingAllow.approvedBy = moderatorId;
      return this.domainRepo.save(existingAllow);
    }

    // Проверяем не существует ли уже
    const existing = await this.domainRepo.findOne({
      where: { domain: normalized, companyId: companyId || undefined, listType },
    });

    if (existing) {
      existing.approvedBy = moderatorId;
      existing.isWildcard = options.isWildcard ?? existing.isWildcard;
      existing.category = options.category || existing.category;
      existing.notes = options.notes || existing.notes;
      return this.domainRepo.save(existing);
    }

    const entry = this.domainRepo.create({
      domain: normalized,
      companyId: companyId || '',
      decision: 'approved',
      listType,
      isGlobal,
      isWildcard: options.isWildcard ?? false,
      category: options.category || 'other',
      notes: options.notes || '',
      reason: options.reason || `Added to ${listType}`,
      approvedBy: moderatorId,
      decidedBy: moderatorId,
      riskScore: 0,
    });

    this.logger.log(`Added to ${listType}: ${normalized} (wildcard: ${entry.isWildcard})`);
    return this.domainRepo.save(entry);
  }

  // Добавить домен в blocklist
  async addToBlocklist(domain: string, companyId: string | null, isGlobal: boolean, moderatorId: string, options: {
    reason?: string;
    notes?: string;
    riskScore?: number;
    forceOverride?: boolean;
  } = {}): Promise<DomainDecision> {
    const normalized = this.normalizeDomain(domain);
    const listType = isGlobal ? 'global_block' : 'org_block';

    // Проверяем конфликт с allowlist (если не force override)
    if (!options.forceOverride) {
      const inAllowlist = await this.domainRepo.findOne({
        where: [
          { domain: normalized, companyId: companyId || '', listType: 'org_allow' },
          { domain: normalized, listType: 'global_allow' },
        ],
      });
      if (inAllowlist) {
        throw new Error(`CONFLICT: Domain "${normalized}" is in allowlist (${inAllowlist.listType}). Remove it from allowlist first.`);
      }
    }

    const existing = await this.domainRepo.findOne({
      where: { domain: normalized, companyId: companyId || undefined },
    });

    if (existing) {
      existing.listType = listType;
      existing.decision = 'blocked';
      existing.decidedBy = moderatorId;
      existing.reason = options.reason || existing.reason;
      return this.domainRepo.save(existing);
    }

    const entry = this.domainRepo.create({
      domain: normalized,
      companyId: companyId || '',
      decision: 'blocked',
      listType,
      isGlobal,
      isWildcard: false,
      reason: options.reason || 'Blocked by moderator',
      notes: options.notes || '',
      approvedBy: moderatorId,
      decidedBy: moderatorId,
      riskScore: options.riskScore || 100,
    });

    this.logger.log(`Added to ${listType}: ${normalized}`);
    return this.domainRepo.save(entry);
  }

  // Получить весь allowlist организации
  async getAllowlist(companyId: string, isGlobal?: boolean) {
    let query = this.domainRepo.createQueryBuilder('d')
      .where('d.listType IN (:...types)', { types: ['global_allow', 'org_allow'] });

    if (isGlobal !== undefined) {
      query = query.andWhere('d.isGlobal = :isGlobal', { isGlobal });
    } else {
      query = query.andWhere('(d.companyId = :companyId OR d.isGlobal = 1)', { companyId });
    }

    return query.orderBy('d.category', 'ASC').addOrderBy('d.domain', 'ASC').getMany();
  }

  // Получить весь blocklist организации
  async getBlocklist(companyId: string) {
    return this.domainRepo.find({
      where: [
        { companyId, listType: 'org_block' },
        { isGlobal: true, listType: 'global_block' },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  // Seed начального logistics allowlist
  async seedLogisticsAllowlist(): Promise<{ added: number; skipped: number }> {
    let added = 0, skipped = 0;

    for (const item of LOGISTICS_GLOBAL_ALLOWLIST) {
      const existing = await this.domainRepo.findOne({
        where: { domain: item.domain, listType: 'global_allow' },
      });
      if (existing) { skipped++; continue; }

      await this.domainRepo.save(this.domainRepo.create({
        domain: item.domain,
        companyId: '',
        decision: 'approved',
        listType: 'global_allow',
        isGlobal: true,
        isWildcard: item.isWildcard,
        category: item.category,
        notes: item.notes,
        reason: 'Logistics seed allowlist',
        approvedBy: 'system',
        decidedBy: 'system',
        riskScore: 0,
      }));
      added++;
    }

    // Seed global blocklist
    for (const item of GLOBAL_BLOCKLIST_SEEDS) {
      const existing = await this.domainRepo.findOne({
        where: { domain: item.domain, listType: 'global_block' },
      });
      if (existing) continue;
      await this.domainRepo.save(this.domainRepo.create({
        domain: item.domain,
        companyId: '',
        decision: 'blocked',
        listType: 'global_block',
        isGlobal: true,
        isWildcard: false,
        category: item.category,
        notes: item.notes,
        reason: 'Known phishing domain',
        approvedBy: 'system',
        decidedBy: 'system',
        riskScore: 100,
      }));
    }

    this.logger.log(`Seed complete: ${added} added, ${skipped} skipped`);
    return { added, skipped };
  }

  // Удалить домен из любого списка
  async removeFromList(domain: string, companyId: string): Promise<{ success: boolean }> {
    const normalized = this.normalizeDomain(domain);
    
    // Удаляем org записи
    await this.domainRepo.query(
      `DELETE FROM domain_decisions WHERE domain = ? AND companyId = ? AND listType IN ('org_allow','org_block','pending_review','approved','blocked')`,
      [normalized, companyId]
    );
    
    // Удаляем глобальные записи созданные модератором (не system seed)
    await this.domainRepo.query(
      `DELETE FROM domain_decisions WHERE domain = ? AND isGlobal = 1 AND decidedBy != 'system' AND listType IN ('global_allow','global_block')`,
      [normalized]
    );
    
    this.logger.log(`Removed from lists: ${normalized}`);
    return { success: true };
  }


  // Редактировать запись в allowlist
  async updateEntry(id: string, updates: { category?: string; notes?: string; isWildcard?: boolean }, moderatorId: string): Promise<DomainDecision> {
    const entry = await this.domainRepo.findOne({ where: { id } });
    if (!entry) throw new Error('Entry not found');
    if (updates.category !== undefined) entry.category = updates.category;
    if (updates.notes !== undefined) entry.notes = updates.notes;
    if (updates.isWildcard !== undefined) entry.isWildcard = updates.isWildcard;
    entry.approvedBy = moderatorId;
    this.logger.log(`Updated allowlist entry: ${entry.domain}`);
    return this.domainRepo.save(entry);
  }

}
