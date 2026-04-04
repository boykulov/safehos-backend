import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainDecision } from './domain.entity';

const TRUSTED_WHITELIST = new Set([
  'google.com','gmail.com','googleapis.com','gstatic.com',
  'microsoft.com','office.com','outlook.com','microsoftonline.com','live.com','bing.com',
  'openai.com','chatgpt.com','amazon.com','amazonaws.com',
  'github.com','githubusercontent.com','stackoverflow.com',
  'apple.com','icloud.com','linkedin.com','zoom.us','slack.com',
  'notion.so','cloudflare.com','dropbox.com','stripe.com',
  'twitter.com','x.com','facebook.com','instagram.com','meta.com','youtube.com',
]);

const SUSPICIOUS_KEYWORDS = ['login','secure','verify','account','signin','update','confirm','banking','wallet','support','helpdesk','recovery','unlock','suspend','password'];
const KNOWN_BRANDS = ['google','microsoft','amazon','paypal','apple','facebook','chase','wellsfargo','netflix','instagram','linkedin','twitter','dropbox','stripe','coinbase'];
const LEET_MAP: Record<string,string> = {'0':'o','1':'l','3':'e','4':'a','5':'s','6':'g','7':'t','8':'b','@':'a'};

function isTrustedRoot(domain: string): boolean {
  if (TRUSTED_WHITELIST.has(domain)) return true;
  const parts = domain.split('.');
  if (parts.length > 2) {
    const root = parts.slice(-2).join('.');
    if (TRUSTED_WHITELIST.has(root)) return true;
  }
  return false;
}

@Injectable()
export class DomainService {
  constructor(
    @InjectRepository(DomainDecision)
    private domainRepo: Repository<DomainDecision>,
  ) {}

  async checkDomain(url: string, companyId: string, userId: string) {
    const domain = this.extractDomain(url);

    if (isTrustedRoot(domain)) {
      return { domain, decision: 'trusted', riskScore: 0, riskLevel: 'trusted', flags: [], message: 'Доверенный домен', eventId: null };
    }

    // Проверяем существующее решение
    let existing = await this.domainRepo.findOne({ where: { domain, companyId } });
    if (!existing) existing = await this.domainRepo.findOne({ where: { domain, isGlobal: true } });
    if (existing && existing.decision !== 'pending' && existing.decision !== 'deferred') {
      return { domain, decision: existing.decision, riskScore: existing.riskScore, riskLevel: this.getRiskLevel(existing.riskScore), flags: [], message: existing.reason, eventId: null, cached: true };
    }

    const { score, flags } = this.scoreDomain(domain);
    const riskLevel = this.getRiskLevel(score);

    // score 0 → trusted
    if (score === 0) {
      return { domain, decision: 'trusted', riskScore: 0, riskLevel: 'trusted', flags: [], message: 'Домен безопасен', eventId: null };
    }

    // score 1-40 → low risk → пропускаем но уведомляем модератора
    if (score <= 40) {
      await this.createInfoEvent(domain, url, score, flags, companyId, userId, 'low');
      return { domain, decision: 'trusted', riskScore: score, riskLevel: 'low', flags, message: 'Низкий риск — сайт открыт, модератор уведомлён', eventId: null };
    }

    // score 41-69 → medium → страница ожидания
    if (score <= 69) {
      const eventId = await this.createSuspiciousEvent(domain, url, score, flags, companyId, userId, 'medium');
      return { domain, decision: 'suspicious', riskScore: score, riskLevel: 'medium', flags, eventId, message: 'Средний риск — отправлен на проверку модератору' };
    }

    // score 70+ → high → автоблокировка + уведомление модератору
    const eventId = await this.createSuspiciousEvent(domain, url, score, flags, companyId, userId, 'high');
    await this.saveDomainDecision(domain, companyId, 'blocked', score, 'Автоматически заблокирован (высокий риск)', '', false);
    return { domain, decision: 'dangerous', riskScore: score, riskLevel: 'high', flags, eventId, message: 'Высокий риск — автоматически заблокирован' };
  }

  getRiskLevel(score: number): string {
    if (score === 0) return 'trusted';
    if (score <= 40) return 'low';
    if (score <= 69) return 'medium';
    return 'high';
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
      if (normalizedRoot === brand && domainRoot !== brand) { score += 60; flags.push(`leet_typosquat:${brand}`); break; }
      if (domainRoot !== brand && this.isSimilar(normalizedRoot, brand)) { score += 45; flags.push(`typosquat:${brand}`); break; }
      if (domain.includes(brand) && domain !== `${brand}.com`) { score += 30; flags.push(`brand_in_domain:${brand}`); break; }
    }
    for (const keyword of SUSPICIOUS_KEYWORDS) {
      if (domain.includes(keyword)) { score += 20; flags.push(`suspicious_keyword:${keyword}`); break; }
    }
    const hyphens = (domain.match(/-/g) || []).length;
    if (hyphens >= 2) { score += 15; flags.push('excessive_hyphens'); }
    const digits = (domain.match(/\d/g) || []).length;
    if (digits >= 2) { score += 15; flags.push('many_digits'); }
    if (domain.length > 25) { score += 10; flags.push('long_domain'); }
    const parts = domain.split('.');
    if (parts.length > 3) { score += 10; flags.push('many_subdomains'); }
    const tld = parts[parts.length - 1];
    if (['ru','xyz','tk','ml','ga','cf','gq','top','club'].includes(tld)) { score += 10; flags.push(`suspicious_tld:${tld}`); }
    return { score: Math.min(score, 100), flags };
  }

  private isSimilar(a: string, b: string): boolean {
    if (Math.abs(a.length - b.length) > 2) return false;
    let diff = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i] !== b[i]) diff++; }
    return diff <= 2 && diff > 0;
  }

  private async createInfoEvent(domain: string, url: string, score: number, flags: string[], companyId: string, userId: string, riskLevel: string): Promise<void> {
    const existing = await this.domainRepo.findOne({ where: { domain, companyId } });
    if (existing) return;
    const event = new DomainDecision();
    event.domain = domain; event.companyId = companyId;
    event.decision = 'info'; event.riskScore = score;
    event.reason = `URL: ${url} | Level: ${riskLevel} | Flags: ${flags.join(', ')}`;
    event.decidedBy = userId; event.isGlobal = false;
    await this.domainRepo.save(event);
  }

  private async createSuspiciousEvent(domain: string, url: string, score: number, flags: string[], companyId: string, userId: string, riskLevel: string): Promise<string> {
    const existing = await this.domainRepo.findOne({ where: { domain, companyId, decision: 'pending' } });
    if (existing) return existing.id;
    const event = new DomainDecision();
    event.domain = domain; event.companyId = companyId;
    event.decision = 'pending'; event.riskScore = score;
    event.reason = `URL: ${url} | Level: ${riskLevel} | Flags: ${flags.join(', ')}`;
    event.decidedBy = userId; event.isGlobal = false;
    const saved = await this.domainRepo.save(event);
    return saved.id;
  }

  async deferEvent(eventId: string, companyId: string, deferUntil: Date): Promise<DomainDecision> {
    const event = await this.domainRepo.findOne({ where: { id: eventId, companyId } });
    if (!event) throw new Error('Event not found');
    event.decision = 'deferred';
    event.reason = (event.reason || '') + ` | Deferred until: ${deferUntil.toISOString()}`;
    return this.domainRepo.save(event);
  }

  async getDeferredEvents(companyId: string) {
    return this.domainRepo.find({
      where: { companyId, decision: 'deferred' },
      order: { createdAt: 'DESC' },
    });
  }

  async getInfoEvents(companyId: string) {
    return this.domainRepo.find({
      where: { companyId, decision: 'info' },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async saveDomainDecision(domain: string, companyId: string, decision: string, riskScore: number, reason: string, decidedBy: string, isGlobal: boolean): Promise<DomainDecision> {
    const existing = await this.domainRepo.findOne({ where: { domain, companyId } });
    if (existing) { existing.decision = decision; existing.reason = reason; existing.decidedBy = decidedBy; return this.domainRepo.save(existing); }
    const d = new DomainDecision();
    d.domain = domain; d.companyId = companyId; d.decision = decision;
    d.riskScore = riskScore; d.reason = reason; d.decidedBy = decidedBy; d.isGlobal = isGlobal;
    return this.domainRepo.save(d);
  }

  async resetDomainDecision(domain: string, companyId: string): Promise<{ success: boolean }> {
    await this.domainRepo.delete({ domain, companyId });
    await this.domainRepo.delete({ domain, isGlobal: true });
    return { success: true };
  }

  async getPendingEvents(companyId: string) {
    return this.domainRepo.find({ where: { companyId, decision: 'pending' }, order: { createdAt: 'DESC' } });
  }

  async getRecentDecisions(companyId: string) {
    const decisions = await this.domainRepo.find({
      where: [{ companyId, decision: 'blocked' }, { companyId, decision: 'approved' }],
      order: { updatedAt: 'DESC' }, take: 500,
    });
    const global = await this.domainRepo.find({
      where: [{ isGlobal: true, decision: 'blocked' }, { isGlobal: true, decision: 'approved' }],
      order: { updatedAt: 'DESC' },
    });
    return [...decisions, ...global].map(d => ({ domain: d.domain, decision: d.decision, updatedAt: d.updatedAt }));
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
