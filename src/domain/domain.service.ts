import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainDecision } from './domain.entity';
import { ExternalFeedsService } from './external-feeds.service';
import { AllowlistService } from './allowlist.service';

@Injectable()
export class DomainService {
  private readonly logger = new Logger('DomainService');

  constructor(
    @InjectRepository(DomainDecision)
    private domainRepo: Repository<DomainDecision>,
    private externalFeeds: ExternalFeedsService,
    private allowlistService: AllowlistService,
  ) {}

  // ============================================================
  // ГЛАВНЫЙ МЕТОД — Default Deny / Zero Trust
  // ============================================================
  async checkDomain(url: string, companyId: string, userId: string) {
    const domain = this.extractDomain(url);
    const normalizedDomain = this.allowlistService.normalizeDomain(domain);

    this.logger.log(`CHECK: ${normalizedDomain} | company: ${companyId}`);

    // ШАГ 1: Проверяем allowlist/blocklist по приоритетам
    const policy = await this.allowlistService.checkDomainPolicy(normalizedDomain, companyId);

    if (policy.verdict === 'allow') {
      this.logger.log(`ALLOW: ${normalizedDomain} (${policy.listType})`);
      return {
        domain: normalizedDomain, decision: 'trusted',
        riskScore: 0, riskLevel: 'trusted',
        listType: policy.listType, category: policy.category,
        flags: [], message: policy.reason, eventId: null,
      };
    }

    if (policy.verdict === 'block') {
      this.logger.log(`BLOCK: ${normalizedDomain} (${policy.listType})`);
      return {
        domain: normalizedDomain, decision: 'blocked',
        riskScore: 100, riskLevel: 'high',
        listType: policy.listType,
        flags: [], message: policy.reason, eventId: null,
      };
    }

    // ШАГ 2: Домен неизвестен — запускаем проверки параллельно
    // Эвристика используется только как METADATA для модератора (не для решения)
    const [gsbResult, heuristic] = await Promise.all([
      this.externalFeeds.checkGoogleSafeBrowsing(url),
      Promise.resolve(this.scoreDomain(normalizedDomain)),
    ]);

    // ШАГ 3: GSB нашёл угрозу → авто-блок + в blocklist
    if (gsbResult.isMalicious) {
      heuristic.flags.push(`gsb:${gsbResult.threatType}`);
      this.logger.log(`GSB BLOCK: ${normalizedDomain} (${gsbResult.threatType})`);

      await this.allowlistService.addToBlocklist(
        normalizedDomain, companyId, false, 'system',
        { reason: `Google Safe Browsing: ${gsbResult.threatType}`, riskScore: 100 }
      );

      const eventId = await this.createPendingReview(
        normalizedDomain, url, 100, heuristic.flags, companyId, userId, 'critical'
      );

      return {
        domain: normalizedDomain, decision: 'dangerous',
        riskScore: 100, riskLevel: 'critical',
        listType: 'org_block', flags: heuristic.flags,
        eventId, message: `Заблокирован Google Safe Browsing: ${gsbResult.threatType}`,
      };
    }

    // ШАГ 4: DEFAULT DENY — домен неизвестен → блокируем + moderation request
    this.logger.log(`UNKNOWN → DENY: ${normalizedDomain} (score: ${heuristic.score})`);

    // Проверяем нет ли уже pending_review для этого домена
    const existingPending = await this.domainRepo.findOne({
      where: { domain: normalizedDomain, companyId, decision: 'pending' }
    });

    let eventId: string;
    if (existingPending) {
      eventId = existingPending.id;
    } else {
      eventId = await this.createPendingReview(
        normalizedDomain, url, heuristic.score, heuristic.flags, companyId, userId, 'unknown'
      );
    }

    return {
      domain: normalizedDomain, decision: 'pending',
      riskScore: heuristic.score, riskLevel: this.getRiskLevel(heuristic.score),
      listType: 'pending_review', flags: heuristic.flags,
      eventId, message: 'Домен не в списке разрешённых — заблокирован, отправлен на проверку',
    };
  }

  // ============================================================
  // Создать pending_review событие для модератора
  // ============================================================
  private async createPendingReview(
    domain: string, url: string, score: number, flags: string[],
    companyId: string, userId: string, level: string
  ): Promise<string> {
    const event = this.domainRepo.create({
      domain, companyId, decision: 'pending',
      listType: 'pending_review',
      riskScore: score,
      reason: `URL: ${url} | Level: ${level} | Flags: ${flags.join(', ')}`,
      decidedBy: userId, isGlobal: false,
    });
    const saved = await this.domainRepo.save(event);
    return saved.id;
  }

  // ============================================================
  // После решения модератора — применяем к allowlist/blocklist
  // ============================================================
  async applyModeratorDecision(
    eventId: string, action: 'approved' | 'blocked',
    moderatorId: string, companyId: string, isGlobal: boolean,
    options: { isWildcard?: boolean; category?: string; notes?: string } = {}
  ) {
    const event = await this.domainRepo.findOne({ where: { id: eventId } });
    if (!event) throw new Error('Event not found');

    if (action === 'approved') {
      // Добавляем в allowlist
      await this.allowlistService.addToAllowlist(
        event.domain, isGlobal ? null : companyId, isGlobal, moderatorId,
        {
          isWildcard: options.isWildcard || false,
          category: options.category || 'other',
          notes: options.notes || '',
          reason: 'Approved by moderator',
        }
      );
    } else {
      // Добавляем в blocklist
      await this.allowlistService.addToBlocklist(
        event.domain, isGlobal ? null : companyId, isGlobal, moderatorId,
        { reason: 'Blocked by moderator', riskScore: event.riskScore }
      );
    }

    // Обновляем pending событие
    event.decision = action === 'approved' ? 'approved' : 'blocked';
    event.listType = action === 'approved' ? (isGlobal ? 'global_allow' : 'org_allow') : (isGlobal ? 'global_block' : 'org_block');
    event.decidedBy = moderatorId;
    await this.domainRepo.save(event);

    return { success: true, eventId, domain: event.domain, decision: event.decision };
  }

  getRiskLevel(score: number): string {
    if (score === 0) return 'trusted';
    if (score <= 40) return 'low';
    if (score <= 69) return 'medium';
    return 'high';
  }

  private scoreDomain(domain: string): { score: number; flags: string[] } {
    const flags: string[] = [];
    let score = 0;
    const KNOWN_BRANDS = ['google','microsoft','amazon','paypal','apple','facebook','chase','wellsfargo','netflix','instagram','linkedin','twitter','dropbox','stripe','coinbase'];
    const SUSPICIOUS_KEYWORDS = ['login','secure','verify','account','signin','update','confirm','banking','wallet','support','helpdesk','recovery','unlock','suspend','password'];
    const LEET_MAP: Record<string,string> = {'0':'o','1':'l','3':'e','4':'a','5':'s','6':'g','7':'t','8':'b','@':'a'};
    const PHISHING_PLATFORMS = ['getresponsesite.com','weebly.com','wixsite.com','webflow.io','glitch.me','netlify.app','000webhostapp.com','site123.me'];

    const domainRoot = domain.split('.')[0];
    const normalizedRoot = domainRoot.split('').map(c => LEET_MAP[c] || c).join('');

    for (const brand of KNOWN_BRANDS) {
      if (normalizedRoot === brand && domainRoot !== brand) { score += 60; flags.push(`leet:${brand}`); break; }
      if (domainRoot !== brand && this.isSimilar(normalizedRoot, brand)) { score += 45; flags.push(`typosquat:${brand}`); break; }
      if (domain.includes(brand) && domain !== `${brand}.com`) { score += 30; flags.push(`brand:${brand}`); break; }
    }
    for (const kw of SUSPICIOUS_KEYWORDS) {
      if (domain.includes(kw)) { score += 20; flags.push(`keyword:${kw}`); break; }
    }
    if ((domain.match(/-/g) || []).length >= 2) { score += 15; flags.push('hyphens'); }
    if ((domain.match(/\d/g) || []).length >= 2) { score += 15; flags.push('digits'); }
    if (domain.length > 25) { score += 10; flags.push('long'); }
    const parts = domain.split('.');
    if (parts.length > 3) { score += 10; flags.push('subdomains'); }
    const tld = parts[parts.length - 1];
    if (['ru','xyz','tk','ml','ga','cf','gq','top','club'].includes(tld)) { score += 10; flags.push(`tld:${tld}`); }
    for (const platform of PHISHING_PLATFORMS) {
      if (domain.endsWith('.' + platform)) {
        score += 25; flags.push(`platform:${platform}`);
        const sub = domain.slice(0, domain.length - platform.length - 1);
        if (/[0-9]/.test(sub) && sub.length > 8) { score += 20; flags.push('random_sub'); }
        break;
      }
    }
    return { score: Math.min(score, 100), flags };
  }

  private isSimilar(a: string, b: string): boolean {
    if (Math.abs(a.length - b.length) > 2) return false;
    let diff = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i] !== b[i]) diff++; }
    return diff <= 2 && diff > 0;
  }

  async deferEvent(eventId: string, companyId: string, deferUntil: Date): Promise<DomainDecision> {
    const event = await this.domainRepo.findOne({ where: { id: eventId, companyId } });
    if (!event) throw new Error('Event not found');
    event.decision = 'deferred';
    event.reason = (event.reason || '') + ` | Deferred until: ${deferUntil.toISOString()}`;
    return this.domainRepo.save(event);
  }

  async getDeferredEvents(companyId: string) {
    return this.domainRepo.find({ where: { companyId, decision: 'deferred' }, order: { createdAt: 'DESC' } });
  }

  async getInfoEvents(companyId: string) {
    return this.domainRepo.find({ where: { companyId, decision: 'info' }, order: { createdAt: 'DESC' }, take: 50 });
  }

  async getPendingEvents(companyId: string) {
    return this.domainRepo.find({
      where: { companyId, decision: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  async saveDomainDecision(domain: string, companyId: string, decision: string, riskScore: number, reason: string, decidedBy: string, isGlobal: boolean): Promise<DomainDecision> {
    const pending = await this.domainRepo.findOne({ where: { domain, companyId, decision: 'pending' } });
    if (pending) {
      pending.decision = decision; pending.reason = reason; pending.decidedBy = decidedBy;
      return this.domainRepo.save(pending);
    }
    const d = this.domainRepo.create({ domain, companyId, decision, riskScore, reason, decidedBy, isGlobal });
    return this.domainRepo.save(d);
  }

  async resetDomainDecision(domain: string, companyId: string): Promise<{ success: boolean; domain?: string }> {
    const normalized = this.allowlistService.normalizeDomain(domain);
    // Удаляем все записи для этого домена (allowlist, blocklist, pending)
    await this.domainRepo.query(
      `DELETE FROM domain_decisions WHERE domain = ? AND (companyId = ? OR companyId = '')`,
      [normalized, companyId]
    );
    // Удаляем глобальные записи (только если не system seed — те трогать не нужно)
    await this.domainRepo.query(
      `DELETE FROM domain_decisions WHERE domain = ? AND isGlobal = 1 AND decidedBy != 'system'`,
      [normalized]
    );
    // Также удаляем старый формат с __blocked__ маркером
    await this.domainRepo.query(
      `DELETE FROM domain_decisions WHERE domain = ? AND companyId = ?`,
      [`__blocked__${normalized}`, companyId]
    );
    return { success: true, domain: normalized };
  }

  async getRecentDecisions(companyId: string) {
    const results = await this.domainRepo.query(`
      SELECT domain, listType, decision, updatedAt, isGlobal
      FROM domain_decisions
      WHERE (companyId = ? OR isGlobal = 1)
        AND listType IN ('global_allow','org_allow','global_block','org_block')
      ORDER BY updatedAt DESC
      LIMIT 1000
    `, [companyId]);

    return results.map((d: any) => {
      const isAllow = (d.listType || d.decision)?.includes('allow');
      return {
        domain: d.domain.replace('__blocked__', ''),
        decision: isAllow ? 'approved' : 'blocked',
        listType: d.listType,
        isGlobal: !!d.isGlobal,
        updatedAt: d.updatedAt,
      };
    });
  }

  extractDomain(url: string): string {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      let hostname = parsed.hostname;
      if (hostname.startsWith('www.')) hostname = hostname.slice(4);
      return hostname.toLowerCase();
    } catch { return url; }
  }
}
