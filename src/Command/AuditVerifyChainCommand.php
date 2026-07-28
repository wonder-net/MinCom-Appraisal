<?php

declare(strict_types=1);

namespace App\Command;

use App\Service\AuditChainVerifier;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Forensic tool wrapping AuditChainVerifier::verify() — Django exposes
 * the equivalent AuditLog.verify_chain() as a plain classmethod with no
 * CLI/HTTP surface either; this console command is the natural place
 * for it in Symfony (ops/compliance can run it on demand).
 */
#[AsCommand(name: 'audit:verify-chain', description: 'Verify the audit log hash-chain and HMAC integrity')]
final class AuditVerifyChainCommand extends Command
{
    public function __construct(private readonly AuditChainVerifier $verifier)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        [$isValid, $errors] = $this->verifier->verify();

        if ($isValid) {
            $io->success('Audit log chain is intact.');

            return Command::SUCCESS;
        }

        $io->error('Audit log chain integrity check FAILED.');
        foreach ($errors as $error) {
            $io->writeln(' - '.$error);
        }

        return Command::FAILURE;
    }
}
