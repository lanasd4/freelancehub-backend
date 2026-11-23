import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100) // without a cap anyone could ask for limit=1000000
  limit: number = 10;

  @IsOptional()
  @IsString()
  search?: string;
}

export class OrderDto extends PaginationDto {
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}

export const skipTake = ({ page, limit }: { page: number; limit: number }) => ({
  skip: (page - 1) * limit,
  take: limit,
});

/** The one list shape of the whole API. */
export function paginated<T>(
  data: T[],
  total: number,
  { page, limit }: { page: number; limit: number },
) {
  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
