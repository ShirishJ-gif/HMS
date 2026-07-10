import { Controller, Get, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetOperationsBoardDto } from './dto/get-operations-board.dto';
import { OperationsBoardService } from './operations-board.service';

@Controller('operations-board')
export class OperationsBoardController {
  constructor(private readonly operationsBoardService: OperationsBoardService) {}

  @Get()
  getBoard(@CurrentUser() user: AuthenticatedUser, @Query() query: GetOperationsBoardDto) {
    return this.operationsBoardService.getBoard(query, user);
  }
}
