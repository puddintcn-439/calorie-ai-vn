import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FoodService } from './food.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Food')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('food')
export class FoodController {
  constructor(private readonly foodService: FoodService) {}

  @Get('search')
  search(@Query('q') query: string) {
    return this.foodService.search(query);
  }

  @Get('barcode/:barcode')
  findByBarcode(@Param('barcode') barcode: string) {
    return this.foodService.findByBarcode(barcode);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.foodService.findById(id);
  }
}
