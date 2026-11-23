import { PartialType } from '@nestjs/mapped-types';
import { ProposalStatus } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OrderDto, PaginationDto } from '../../common/dto/pagination.dto';

export class CreateProposalDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  price: number;

  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays: number;

  /** why the freelancer fits the job */
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  message: string;
}

export class UpdateProposalDto extends PartialType(CreateProposalDto) {}

/** The project owner compares proposals page by page, sorted by price or date. */
export class ListProjectProposalsDto extends OrderDto {
  @IsOptional()
  @IsIn(['price', 'createdAt'])
  sortBy: 'price' | 'createdAt' = 'createdAt';

  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;
}

export class ListMyProposalsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;
}
