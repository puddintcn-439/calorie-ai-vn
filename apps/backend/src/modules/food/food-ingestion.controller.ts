import {
  Controller, Post, Get, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum, IsString, IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BatchIngestionReport,
  FoodIngestionBatchSource,
  FoodIngestionPresetScope,
  FoodIngestionService,
  IngestionReport,
} from './food-ingestion.service';

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

export class IngestUSDADto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  maxPages?: number = 2;
}

export class IngestBatchDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  queries!: string[];

  @IsOptional()
  @IsEnum(['openfoodfacts', 'usda', 'both'])
  source?: FoodIngestionBatchSource = 'both';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  maxPages?: number = 1;
}

export class IngestPresetDto {
  @IsOptional()
  @IsEnum(['vietnamese', 'global', 'all'])
  scope?: FoodIngestionPresetScope = 'all';

  @IsOptional()
  @IsEnum(['openfoodfacts', 'usda', 'both'])
  source?: FoodIngestionBatchSource = 'both';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  maxPages?: number = 1;
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

  @Post('usda')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest foods from USDA FoodData Central by search query' })
  ingestUSDA(@Body() dto: IngestUSDADto): Promise<IngestionReport> {
    return this.ingestion.ingestFromUSDA(dto.query, dto.maxPages ?? 2);
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch ingest foods from USDA, Open Food Facts, or both' })
  ingestBatch(@Body() dto: IngestBatchDto): Promise<BatchIngestionReport> {
    return this.ingestion.ingestBatch(dto.queries, dto.source ?? 'both', dto.maxPages ?? 1);
  }

  @Post('preset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch ingest a preset catalog of Vietnamese, global, or all common foods' })
  ingestPreset(@Body() dto: IngestPresetDto): Promise<BatchIngestionReport> {
    return this.ingestion.ingestPresetCatalog(
      dto.scope ?? 'all',
      dto.source ?? 'both',
      dto.maxPages ?? 1,
    );
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
