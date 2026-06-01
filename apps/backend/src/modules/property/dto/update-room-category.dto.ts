import { PartialType } from '@nestjs/mapped-types';
import { CreateRoomCategoryDto } from './create-room-category.dto';

export class UpdateRoomCategoryDto extends PartialType(CreateRoomCategoryDto) {}
