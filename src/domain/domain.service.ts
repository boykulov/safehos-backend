import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainDecision } from './domain.entity';

const TRUSTED_WHITELIST = new Set([
  'google.com', 'gmail.com', 'microsoft.com', 'office.com',
  'outlook.com', 'microsoftonline.com', 'openai.com', 'chatgpt.com',
  'amazon.com', 'github.com', 'stackoverflow.com', 'cloudflare.com',
  'apple.com', 'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
  'zoom.us', 'slack.com', 'notion.so', 'dropbox.com', 'stripe.com',
]);

const SUSPICIOUS_KEYWORDS = [
  'login', 'secure', 'verify', 'account', 'signin',
  'update', 'confirm', 'banking', 'wallet', 'support',
  'helpdesk', 'recovery', 'unlock', 'suspend', 'password',
];

const KNOWN_BRANDS = [
  'google', 'microsoft', 'amazon', 'paypal', 'apple',
  'facebook', 'chase', 'wellsfargo', 'netflix', 'instagram',
  'linkedin', 'twitter', 'dropbox', 'stripe', 'coinbase',
];

const LEET_MAP = {
  '0': 'o', '1': 'l', '3': 'e', '4': 'a',
  '5': 's', '6': 'g', '7': 't', '8': 'b', '@': 'a',
};

@Injectable()
export class DomainService {
  constructor(
    @InjectRepository(DomainDecision)
    private domainRepo: Repository<DomainDecision>,
  ) {}

  async checkDomain(url: string, companyId: string, userId: string) {
    const domain = this.extractDomain(url);

    // Белый список — сразу trusted
    if (TRUSTED_WHITELIST.has(domain)) {
      return { domain, decision: 'trusted', riskScore: 0, flags: [], message: 'Доверенный домен', eventId: null };
    }

    // Ищем существующее решение
    let existing = await this.domainRepo.findOne({ where: { domain, companyId } });
    if (!existing) {
      existing = await this.domainRepo.findOne({ where: { domain, isGlobal: true } });
    }

    if (existing && existing.decision !== 'pending') {
      return {
        domain, decision: existing.decision, riskScore: existing.riskScore,
        flags: [], message: existing.reason, eventId: null, cached: true,
      };
    }

    // Анализируем домен
    const { score, flags } = this.scoreDomain(domain);

    // Score = 0 → полностью безопасный
    if (score === 0) {
      return { domain, decision: 'trusted', riskScore: 0, flags: [], message: 'Домен безопасен', eventId: null };
    }

    // Любой score > 0 → к модератору
    const eventId = await this.createSuspiciousEvent(domain, url, score, flags, companyId, userId);

    return {
      domain,
      decision: 'suspicious',
      riskScore: score,
      flags,
      eventId,
      fullUrl: url,
      message: score >= 70
        ? 'Высокий риск — отправлен модератору для блокировки'
        : 'Подозрительный домен — отправлен на проверку',
    };
  }

  private normalizeLeet(str: string): string {
    return str.split('').map(c => LEET_MAP[c] || c).join('');
  }

  private scoreDomain(domain: string): { score: number; flags: string[] } {
    const flags: string[] = [];
    let score = 0;

    const domainRoot = domain.split('.')[0];
    const normalizedRoot = this.normalizeLeet(domainRoot);

    for (const brand of KNOWN_BRANDS) {
      if (normalizedRoot === brand && domainRoot !== brand) {
        score += 60; flags.push(`leet_typosquat:${brand}`); break;
      }
      if (domainRoot !== brand && this.isSimilar(normalizedRoot, brand)) {
        score += 45; flags.push(`typosquat:${brand}`); break;
      }
      if (domain.includes(brand) && domain !== `${brand}.com`) {
        score += 30; flags.push(`brand_in_domain:${brand}`); break;
      }
    }

    for (const keyword of SUSPICIOUS_KEYWORDS) {
      if (domain.includes(keyword)) {
        score += 20; flags.push(`suspicious_keyword:${keyword}`); break;
      }
    }

    const hyphens = (domain.match(/-/g) || []).length;
    if (hyphens >= 2) { score += 15; flags.push('excessive_hyphens'); }

    const digits = (domain.match(/\d/g) || []).length;
    if (digits >= 2) { score += 15; flags.push('many_digits'); }

    if (domain.length > 25) { score += 10; flags.push('long_domain'); }

    const parts = domain.split('.');
    if (parts.length > 3) { score += 10; flags.push('many_subdomains'); }

    // Нет TLD у известных доменов — подозрительно
    const tld = parts[parts.length - 1];
    const suspiciousTlds = ['ru', 'xyz', 'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'club'];
    if (suspiciousTlds.includes(tld)) { score += 10; flags.push(`suspicious_tld:${tld}`); }

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
    domain: string, url: string, score: number,
    flags: string[], companyId: string, userId: string,
  ): Promise<string> {
    // Проверяем нет ли уже pending события для этого домена
    const existing = await this.domainRepo.findOne({
      where: { domain, companyId, decision: 'pending' }
    });
    if (existing) return existing.id;

    const event = new DomainDecision();
    event.domain = domain;
    event.companyId = companyId;
    event.decision = 'pending';
    event.riskScore = score;
    event.reason = `URL: ${url} | Flags: ${flags.join(', ')}`;
    event.decidedBy = userId;
    event.isGlobal = false;
    const saved = await this.domainRepo.save(event);
    return saved.id;
  }

  async saveDomainDecision(
    domain: string, companyId: string, decision: string,
    riskScore: number, reason: string, decidedBy: string, isGlobal: boolean,
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
    } catch { return url; }
  }
}
