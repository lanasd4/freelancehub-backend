import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSkillDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;
}

export class UpdateSkillDto extends PartialType(CreateSkillDto) {}
