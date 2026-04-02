import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainDecision } from './domain.entity';

const TRUSTED_WHITELIST = new Set([
  'google.com', 'gmail.com', 'microsoft.com', 'office.com',
  'outlook.com', 'microsoftonline.com', 'openai.com', 'chatgpt.com',
  'amazon.com', 'github.com', 'stackoverflow.com', 'cloudflare.com',
  'apple.com', 'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
  'zoom.us', 'slack.com', 'notion.so',
]);

const SUSPICIOUS_KEYWORDS = ['login', 'secure', 'verify', 'account', 'signin', 'update', 'confirm', 'banking'];
const KNOWN_BRANDS = ['google', 'microsoft', 'amazon', 'paypal', 'apple', 'facebook', 'chase'];

@Injectable()
export class DomainService {
  constructor(
    @InjectRepository(DomainDecision)
    private domainRepo: Repository<DomainDecision>,
  ) {}

  async checkDomain(url: string, companyId: string, userId: string) {
    const domain = this.extractDomain(url);

    if (TRUSTED_WHITELIST.has(domain)) {
      return { domain, decision: 'trusted', riskScore: 0, flags: [], message: 'Доверенный домен', eventId: null };
    }

    let existing = await this.domainRepo.findOne({ where: { domain, companyId } });
    if (!existing) {
      existing = await this.domainRepo.findOne({ where: { domain, isGlobal: true } });
    }

    if (existing) {
      return {
        domain,
        decision: existing.decision,
        riskScore: existing.riskScore,
        flags: [],
        message: existing.reason,
        eventId: null,
        cached: true,
      };
    }

    const { score, flags } = this.scoreDomain(domain);

    let decision: string;
    if (score >= 70) decision = 'dangerous';
    else if (score >= 30) decision = 'suspicious';
    else decision = 'trusted';

    let eventId: string | null = null;
    if (decision === 'suspicious') {
      eventId = await this.createSuspiciousEvent(domain, score, flags, companyId, userId);
    }

    if (decision === 'dangerous') {
      await this.saveDomainDecision(domain, companyId, 'blocked', score, 'Автоматически заблокирован', '', false);
    }

    return {
      domain,
      decision,
      riskScore: score,
      flags,
      eventId,
      message: this.getDecisionMessage(decision),
    };
  }

  private scoreDomain(domain: string): { score: number; flags: string[] } {
    const flags: string[] = [];
    let score = 0;

    for (const keyword of SUSPICIOUS_KEYWORDS) {
      if (domain.includes(keyword)) {
        score += 20;
        flags.push(`suspicious_keyword:${keyword}`);
        break;
      }
    }

    const hyphens = (domain.match(/-/g) || []).length;
    if (hyphens > 2) { score += 15; flags.push('excessive_hyphens'); }

    const digits = (domain.match(/\d/g) || []).length;
    if (digits > 3) { score += 10; flags.push('many_digits'); }

    const domainRoot = domain.split('.')[0];
    for (const brand of KNOWN_BRANDS) {
      if (domainRoot !== brand && this.isSimilar(domainRoot, brand)) {
        score += 40;
        flags.push(`typosquat:${brand}`);
        break;
      }
    }

    if (domain.length > 30) { score += 10; flags.push('long_domain'); }

    return { score: Math.min(score, 100), flags };
  }

  private isSimilar(a: string, b: string): boolean {
    if (Math.abs(a.length - b.length) > 2) return false;
    let differences = 0;
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      if (a[i] !== b[i]) differences++;
    }
    return differences <= 2 && differences > 0;
  }

  private async createSuspiciousEvent(
    domain: string,
    score: number,
    flags: string[],
    companyId: string,
    userId: string,
  ): Promise<string> {
    const event = new DomainDecision();
    event.domain = domain;
    event.companyId = companyId;
    event.decision = 'pending';
    event.riskScore = score;
    event.reason = `Flags: ${flags.join(', ')}`;
    event.decidedBy = userId;
    event.isGlobal = false;

    const saved = await this.domainRepo.save(event);
    return saved.id;
  }

  async saveDomainDecision(
    domain: string,
    companyId: string,
    decision: string,
    riskScore: number,
    reason: string,
    decidedBy: string,
    isGlobal: boolean,
  ): Promise<DomainDecision> {
    const existing = await this.domainRepo.findOne({ where: { domain, companyId } });

    if (existing) {
      existing.decision = decision;
      existing.reason = reason;
      existing.decidedBy = decidedBy;
      return this.domainRepo.save(existing);
    }

    const newDecision = new DomainDecision();
    newDecision.domain = domain;
    newDecision.companyId = companyId;
    newDecision.decision = decision;
    newDecision.riskScore = riskScore;
    newDecision.reason = reason;
    newDecision.decidedBy = decidedBy;
    newDecision.isGlobal = isGlobal;

    return this.domainRepo.save(newDecision);
  }

  async getPendingEvents(companyId: string) {
    return this.domainRepo.find({
      where: { companyId, decision: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  extractDomain(url: string): string {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      let hostname = parsed.hostname;
      if (hostname.startsWith('www.')) hostname = hostname.slice(4);
      return hostname;
    } catch {
      return url;
    }
  }

  private getDecisionMessage(decision: string): string {
    const messages: Record<string, string> = {
      trusted: 'Домен безопасен',
      suspicious: 'Отправлен на проверку модератору',
      dangerous: 'Заблокирован — высокий риск фишинга',
    };
    return messages[decision] || 'Неизвестный статус';
  }
}
