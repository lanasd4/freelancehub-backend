import { PartialType } from '@nestjs/mapped-types';
import { ContractStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateMilestoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  amount: number;
}

export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {}

/** multipart field next to the files */
export class SubmitMilestoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  note: string;
}

export class RequestRevisionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  note: string;
}

export class ListContractsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;
}
