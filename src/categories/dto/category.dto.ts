import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
