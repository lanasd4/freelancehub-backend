import { PartialType } from '@nestjs/mapped-types';
import { ProjectStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
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
  MinDate,
} from 'class-validator';
import { OrderDto } from '../../common/dto/pagination.dto';

// Sent as multipart/form-data (files + fields), so numbers and dates arrive
// as strings and need @Type(...) to be converted before validation.
export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  description: string;

  @Type(() => Number)
  @IsInt()
  categoryId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  budgetMin: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  budgetMax: number;

  /** last moment to receive proposals (ISO date), must be in the future */
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), { message: 'deadline must be in the future' })
  deadline: Date;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

export const PROJECT_SORT_FIELDS = ['createdAt', 'budget'] as const;

export class ListProjectsDto extends OrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  /** default: OPEN (what freelancers browse) */
  @IsOptional()
  @IsEnum(ProjectStatus)
  status: ProjectStatus = ProjectStatus.OPEN;

  /** projects whose budget range overlaps [budgetMin, budgetMax] */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMax?: number;

  // whitelist: never pass a column name from the client straight to the DB
  @IsOptional()
  @IsIn(PROJECT_SORT_FIELDS)
  sortBy: (typeof PROJECT_SORT_FIELDS)[number] = 'createdAt';
}
