import {
  Controller, Post, Get, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FoodIngestionService, IngestionReport } from './food-ingestion.service';

export class IngestOFFDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  maxPages?: number = 3;
}

@ApiTags('Food Ingestion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('food/ingest')
export class FoodIngestionController {
  constructor(private readonly ingestion: FoodIngestionService) {}

  @Post('openfoodfacts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest foods from Open Food Facts by search query' })
  ingestOFF(@Body() dto: IngestOFFDto): Promise<IngestionReport> {
    return this.ingestion.ingestFromOpenFoodFacts(dto.query, dto.maxPages ?? 3);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate nutrient values for all unscored food records' })
  validateFoods(): Promise<{ processed: number; flagged: number }> {
    return this.ingestion.validateExistingFoods();
  }

  @Get('confidence')
  @ApiOperation({ summary: 'Get foods with low nutrient confidence (< threshold)' })
  async getLowConfidence(
    @Query('threshold') threshold = '0.7',
    @Query('limit') limit = '50',
  ): Promise<{ foods: Partial<unknown>[]; count: number }> {
    const foods = await this.ingestion.getLowConfidenceFoods(
      parseFloat(threshold),
      parseInt(limit, 10),
    );
    return { foods, count: foods.length };
  }
}
