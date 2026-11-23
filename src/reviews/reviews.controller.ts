import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateReviewDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsController {
  constructor(private reviews: ReviewsService) {}

  @Roles(Role.CLIENT, Role.FREELANCER)
  @Post('contracts/:id/reviews')
  create(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(id, user, dto);
  }

  @Public()
  @Get('users/:id/reviews')
  forUser(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginationDto,
  ) {
    return this.reviews.forUser(id, query);
  }
}
