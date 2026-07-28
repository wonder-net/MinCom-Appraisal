<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\Signature;
use App\Enum\AppraisalPartyRole;
use App\Enum\SignatureAction;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<Signature>
 */
final class SignatureFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return Signature::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'appraisal' => AppraisalFactory::new(),
            'signer' => UserFactory::new(),
            'signerRole' => AppraisalPartyRole::APPRAISEE,
            'action' => SignatureAction::ACCEPT,
            'signedAt' => new \DateTimeImmutable(),
            'ipAddress' => '127.0.0.1',
            'userAgentHash' => hash('sha256', 'test-agent'),
            'signingRound' => 1,
        ];
    }
}
