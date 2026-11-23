import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AmountDto, ListTransactionsDto } from './dto/wallet.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private wallet: WalletService) {}

  /** { balance (available), heldBalance (escrow) } */
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.wallet.get(user.userId);
  }

  @Roles(Role.CLIENT)
  @HttpCode(200)
  @Post('deposit')
  deposit(@CurrentUser() user: AuthUser, @Body() dto: AmountDto) {
    return this.wallet.deposit(user.userId, dto.amount);
  }

  @Roles(Role.FREELANCER, Role.CLIENT)
  @HttpCode(200)
  @Post('withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Body() dto: AmountDto) {
    return this.wallet.withdraw(user.userId, dto.amount);
  }

  /** ?type=PAYMENT&from=2026-01-01&to=2026-12-31&page=1&limit=20 */
  @Get('transactions')
  transactions(
    @CurrentUser() user: AuthUser,
    @Query() query: ListTransactionsDto,
  ) {
    return this.wallet.transactions(user.userId, query);
  }
}
