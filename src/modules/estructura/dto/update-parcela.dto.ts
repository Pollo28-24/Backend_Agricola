import { PartialType } from '@nestjs/swagger';
import { CreateParcelaDto } from './create-parcela.dto';

export class UpdateParcelaDto extends PartialType(CreateParcelaDto) {}
