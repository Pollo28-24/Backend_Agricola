import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginacionMetaDto } from '../dto/paginated-response.dto';

export const ApiPaginatedResponse = <TModel extends Type<unknown>>(
  model: TModel,
  description = 'Listado paginado obtenido exitosamente',
) => {
  return applyDecorators(
    ApiExtraModels(PaginacionMetaDto, model),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
            description: 'Listado de elementos de la página actual',
          },
          meta: {
            $ref: getSchemaPath(PaginacionMetaDto),
            description: 'Metadatos de la paginación',
          },
        },
      },
    }),
  );
};
