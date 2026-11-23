import { TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class AmountDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000) // per operation; protects against typos in this no-gateway version
  amount: number;
}

/** History: page by page, filtered by type and/or between two dates. */
export class ListTransactionsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
