<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\BscPerspective;
use App\Repository\BscPerspectiveRepository;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.serializers.PerspectiveKeyField /
 * _perspective_name_to_key / _perspective_key_to_name: the frontend
 * addresses BSC perspectives by an uppercase key (e.g. "FINANCIAL"),
 * not by name or UUID directly.
 */
final class PerspectiveKeyResolver
{
    /**
     * @var array<string, string>
     */
    private const KEY_TO_NAME = [
        'FINANCIAL' => 'Financial',
        'CUSTOMER' => 'Customer',
        'INTERNAL_BUSINESS_PROCESSES' => 'Internal Business Processes',
        'LEARNING_AND_GROWTH' => 'Learning and Growth',
    ];

    public function __construct(private readonly BscPerspectiveRepository $perspectives)
    {
    }

    /**
     * Resolves an uppercase key (preferred) or a raw UUID string to a
     * BscPerspective. Returns null if neither matches.
     */
    public function resolve(string $raw): ?BscPerspective
    {
        $raw = trim($raw);

        $name = self::KEY_TO_NAME[strtoupper($raw)] ?? null;
        if ($name !== null) {
            return $this->perspectives->findOneBy(['name' => $name]);
        }

        if (Uuid::isValid($raw)) {
            return $this->perspectives->find(Uuid::fromString($raw));
        }

        return null;
    }

    public function toKey(BscPerspective $perspective): string
    {
        $nameToKey = array_flip(self::KEY_TO_NAME);

        return $nameToKey[$perspective->getName()] ?? strtoupper(str_replace(' ', '_', $perspective->getName()));
    }
}
