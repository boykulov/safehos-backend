import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';

@Injectable()
export class ExternalFeedsService {
  private readonly logger = new Logger('ExternalFeedsService');
  private readonly GSB_API = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
  private gsbCache = new Map<string, { safe: boolean; timestamp: number; threatType?: string }>();
  private readonly GSB_CACHE_TTL = 60 * 60 * 1000; // 1 час

  private get gsbKey(): string {
    return process.env.GOOGLE_SAFE_BROWSING_KEY || '';
  }

  async checkGoogleSafeBrowsing(url: string): Promise<{ isMalicious: boolean; threatType: string | null; score: number }> {
    if (!this.gsbKey) {
      return { isMalicious: false, threatType: null, score: 0 };
    }

    // Проверяем кэш
    const cached = this.gsbCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.GSB_CACHE_TTL) {
      return { isMalicious: !cached.safe, threatType: cached.threatType || null, score: cached.safe ? 0 : 100 };
    }

    try {
      const result = await this.httpPost(
        `${this.GSB_API}?key=${this.gsbKey}`,
        {
          client: { clientId: 'safehos', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
          },
        }
      );

      const matches = result?.matches || [];
      const isMalicious = matches.length > 0;
      const threatType = isMalicious ? matches[0].threatType : null;

      this.gsbCache.set(url, { safe: !isMalicious, timestamp: Date.now(), threatType });
      this.logger.log(`GSB check: ${url} → ${isMalicious ? `MALICIOUS (${threatType})` : 'SAFE'}`);

      return { isMalicious, threatType, score: isMalicious ? 100 : 0 };
    } catch (error) {
      this.logger.warn(`GSB check failed for ${url}: ${error.message}`);
      return { isMalicious: false, threatType: null, score: 0 };
    }
  }

  // HTTP POST без внешних зависимостей — используем встроенный Node.js https
  private httpPost(url: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 3000,
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(responseData)); }
          catch { resolve({}); }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(data);
      req.end();
    });
  }
}
