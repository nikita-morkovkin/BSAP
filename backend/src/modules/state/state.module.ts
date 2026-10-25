import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StateManagerService } from './state-manager.service';

@Module({
  imports: [ConfigModule],
  providers: [StateManagerService],
  exports: [StateManagerService],
})
export class StateModule {}
