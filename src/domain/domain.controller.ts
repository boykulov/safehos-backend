import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DomainService } from './domain.service';
import { CheckDomainDto } from './dto/check-domain.dto';

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

  // Сброс решения по домену (для разблокировки)
  @Delete('decision/:domain')
  async resetDecision(@Param('domain') domain: string, @Request() req) {
    return this.domainService.resetDomainDecision(domain, req.user.companyId);
  }
}
