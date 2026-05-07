import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScanTextDto {
  @ApiProperty({ example: '1 tô phở bò đặc biệt' })
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class ScanImageDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  image: Express.Multer.File;
}

export class RefineScanDto {
  @ApiProperty({ description: 'Original scan_id to refine' })
  @IsString()
  @IsNotEmpty()
  scan_id: string;

  @ApiProperty({ example: 'Thực ra là 2 tô, thêm 1 quả trứng' })
  @IsString()
  @IsNotEmpty()
  context: string;

  @ApiProperty({ description: 'Tên các món đã detect lần đầu', type: [String] })
  original_items_summary: string;
}

export class CoachMessageDto {
  @ApiProperty({ example: 'Tối nay tôi nên ăn gì?' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ example: 1200 })
  @IsNumber()
  @Min(0)
  today_calories: number;

  @ApiProperty({ example: 1800 })
  @IsNumber()
  @Min(500)
  target_calories: number;
}
