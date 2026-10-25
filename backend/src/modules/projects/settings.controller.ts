import { Controller, Get } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('models')
  public getModels() {
    return this.catalog.getModels();
  }

  @Get('voices')
  public getVoices() {
    return this.catalog.getVoices();
  }
}
