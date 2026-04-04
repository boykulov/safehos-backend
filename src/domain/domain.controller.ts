import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DomainService } from './domain.service';
import { CheckDomainDto } from './dto/check-domain.dto';
import { IsString, IsOptional, IsNumber } from 'class-validator';

class DeferEventDto {
  @IsNumber()
  minutes: number; // на сколько минут отложить
}

@Controller('domain')
@UseGuards(AuthGuard('jwt'))
export class DomainController {
  constructor(private domainService: DomainService) {}

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
    return this.domainService.resetDomainDecision(domain, req.user.companyId);
  }

  @Get('decisions/sync')
  async syncDecisions(@Request() req) {
    return this.domainService.getRecentDecisions(req.user.companyId);
  }
}
