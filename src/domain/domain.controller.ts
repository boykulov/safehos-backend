import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards, Request, Query, Res, ConflictException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DomainService } from './domain.service';
import { AllowlistService } from './allowlist.service';
import { CheckDomainDto } from './dto/check-domain.dto';

class DeferEventDto { minutes: number; }
class AddToListDto {
  domain: string = '';
  isGlobal?: boolean = false;
  isWildcard?: boolean = false;
  category?: string = 'other';
  notes?: string = '';
  reason?: string = '';
}

@Controller('domain')
@UseGuards(AuthGuard('jwt'))
export class DomainController {
  constructor(
    private domainService: DomainService,
    private allowlistService: AllowlistService,
  ) {}

  @Post('check')
  async checkDomain(@Body() dto: CheckDomainDto, @Request() req) {
    return this.domainService.checkDomain(dto.url, req.user.companyId, req.user.id);
  }

  @Get('pending')
  async getPending(@Request() req) {
    return this.domainService.getPendingEvents(req.user.companyId);
  }

  @Get('deferred')
  async getDeferred(@Request() req) {
    return this.domainService.getDeferredEvents(req.user.companyId);
  }

  @Get('info')
  async getInfo(@Request() req) {
    return this.domainService.getInfoEvents(req.user.companyId);
  }

  @Post('defer/:eventId')
  async deferEvent(@Param('eventId') eventId: string, @Body() dto: DeferEventDto, @Request() req) {
    const deferUntil = new Date(Date.now() + (dto.minutes || 30) * 60 * 1000);
    return this.domainService.deferEvent(eventId, req.user.companyId, deferUntil);
  }

  @Delete('decision/:domain')
  async resetDecision(@Param('domain') domain: string, @Request() req) {
    // Удаляем из всех списков
    await this.allowlistService.removeFromList(domain, req.user.companyId);
    return this.domainService.resetDomainDecision(domain, req.user.companyId);
  }

  @Get('decisions/sync')
  async syncDecisions(@Request() req) {
    return this.domainService.getRecentDecisions(req.user.companyId);
  }

  // ============================================================
  // ALLOWLIST / BLOCKLIST endpoints
  // ============================================================

  @Get('allowlist')
  async getAllowlist(@Request() req, @Query('global') isGlobal?: string) {
    const globalOnly = isGlobal === 'true' ? true : isGlobal === 'false' ? false : undefined;
    return this.allowlistService.getAllowlist(req.user.companyId, globalOnly);
  }

  @Get('blocklist')
  async getBlocklist(@Request() req) {
    return this.allowlistService.getBlocklist(req.user.companyId);
  }

  @Post('allowlist')
  async addToAllowlist(@Body() body: any, @Request() req) {
    const domain = body.domain;
    if (!domain) throw new BadRequestException('Domain is required');
    // Явно парсим boolean — axios может передавать строки
    const isGlobal = body.isGlobal === true || body.isGlobal === 'true';
    const isWildcard = body.isWildcard === true || body.isWildcard === 'true';
    try {
      return await this.allowlistService.addToAllowlist(
        String(domain).trim(), req.user.companyId, isGlobal, req.user.id,
        { isWildcard, category: body.category || 'other', notes: body.notes || '', reason: body.reason || '' }
      );
    } catch(e: any) {
      if (e.message?.startsWith('CONFLICT:')) throw new ConflictException(e.message.replace('CONFLICT: ', ''));
      throw e;
    }
  }

  @Post('blocklist')
  async addToBlocklist(@Body() body: any, @Request() req) {
    const domain = body.domain;
    if (!domain) throw new BadRequestException('Domain is required');
    const isGlobal = body.isGlobal === true || body.isGlobal === 'true';
    try {
      return await this.allowlistService.addToBlocklist(
        String(domain).trim(), req.user.companyId, isGlobal, req.user.id,
        { reason: body.reason || 'Blocked by moderator', notes: body.notes || '' }
      );
    } catch(e: any) {
      if (e.message?.startsWith('CONFLICT:')) throw new ConflictException(e.message.replace('CONFLICT: ', ''));
      throw e;
    }
  }

  // Seed logistics allowlist (только для admin/moderator)
  @Post('seed-logistics')
  async seedLogistics() {
    return this.allowlistService.seedLogisticsAllowlist();
  }

  // PATCH — редактировать домен в allowlist
  @Patch('allowlist/:id')
  async updateAllowlistEntry(
    @Param('id') id: string,
    @Body('category') category: string,
    @Body('notes') notes: string,
    @Body('isWildcard') isWildcard: boolean,
    @Request() req
  ) {
    return this.allowlistService.updateEntry(id, { category, notes, isWildcard }, req.user.id);
  }

  // GET — экспорт allowlist в CSV
  @Get('allowlist/export')
  async exportAllowlist(@Request() req, @Res() res: any) {
    const list = await this.allowlistService.getAllowlist(req.user.companyId);
    const rows = [
      'domain,category,type,wildcard,notes,added_by,created_at',
      ...list.map(d => [
        d.domain,
        d.category || 'other',
        d.isGlobal ? 'global' : 'org',
        d.isWildcard ? 'yes' : 'no',
        (d.notes || '').replace(/,/g, ';'),
        d.approvedBy || d.decidedBy || 'system',
        new Date(d.createdAt).toISOString().split('T')[0],
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="safehos-allowlist.csv"');
    return res.send(rows);
  }
}
