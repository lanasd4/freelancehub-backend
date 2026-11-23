import { IsNumber, IsPositive, Max } from 'class-validator';

export class DepositDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000) // per top-up; protects against typos in this no-gateway version
  amount: number;
}
