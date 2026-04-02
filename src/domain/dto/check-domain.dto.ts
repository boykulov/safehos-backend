import { IsString } from 'class-validator';

export class CheckDomainDto {
  @IsString()
  url: string;

  @IsString()
  tabId: string;
}
