import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';

export function validationPipe(message: string) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    exceptionFactory: (validationErrors) => new UnprocessableEntityException({
      statusCode: 422,
      message,
      errors: validationErrors.map(({ property, constraints }) => ({
        field: property,
        message: Object.values(constraints ?? {}).join(', '),
      })),
    }),
  });
}
