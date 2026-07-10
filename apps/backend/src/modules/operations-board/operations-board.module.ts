import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { OperationsBoardController } from './operations-board.controller';
import { OperationsBoardService } from './operations-board.service';

@Module({
  imports: [DashboardModule],
  controllers: [OperationsBoardController],
  providers: [OperationsBoardService],
})
export class OperationsBoardModule {}
