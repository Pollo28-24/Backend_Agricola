import { PartialType } from '@nestjs/swagger';
import { CreatePredioDto } from './create-predio.dto';

export class UpdatePredioDto extends PartialType(CreatePredioDto) {}
