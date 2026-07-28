<?php

declare(strict_types=1);

namespace App\Validation;

use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\Validator\ConstraintViolation;
use Symfony\Component\Validator\ConstraintViolationList;
use Symfony\Component\Validator\Exception\ValidationFailedException;

/**
 * Builds a field-level validation error the same way Symfony's own
 * #[MapRequestPayload] does (wrapping a ValidationFailedException), so
 * hand-written cross-field/stateful checks in a controller — e.g. "old
 * password is incorrect", which needs the authenticated user and can't
 * live on a stateless DTO constraint — flow through the exact same
 * ExceptionListener flattening path as declarative DTO validation.
 * Mirrors Django serializers raising ValidationError({"field": "message"})
 * from inside .validate().
 *
 * The wrapper is nominally an UnprocessableEntityHttpException (422) —
 * that's just the vehicle Symfony's own #[MapRequestPayload] uses too.
 * ExceptionListener detects the wrapped ValidationFailedException and
 * always emits 400 regardless, matching Django's real contract where
 * every serializer ValidationError is 400 (never 422).
 */
final class ValidationErrorFactory
{
    public static function field(string $field, string $message): UnprocessableEntityHttpException
    {
        return self::fields([$field => $message]);
    }

    /**
     * One field failing multiple rules at once (e.g. every unmet password
     * complexity rule) — mirrors Django's exc.messages list under a single
     * field key, represented here as one {field, message} pair per message.
     *
     * @param list<string> $messages
     */
    public static function manyForField(string $field, array $messages): UnprocessableEntityHttpException
    {
        $violations = new ConstraintViolationList();

        foreach ($messages as $message) {
            $violations->add(new ConstraintViolation($message, null, [], null, $field, null));
        }

        return new UnprocessableEntityHttpException(previous: new ValidationFailedException(null, $violations));
    }

    /**
     * @param array<string, string> $fieldMessages
     */
    public static function fields(array $fieldMessages): UnprocessableEntityHttpException
    {
        $violations = new ConstraintViolationList();

        foreach ($fieldMessages as $field => $message) {
            $violations->add(new ConstraintViolation($message, null, [], null, $field, null));
        }

        return new UnprocessableEntityHttpException(previous: new ValidationFailedException(null, $violations));
    }
}
