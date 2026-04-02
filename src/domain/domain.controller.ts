import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
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
}
