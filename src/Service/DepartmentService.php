<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Department;
use App\Repository\DepartmentRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Port of apps.employees.services.get_or_create_department /
 * generate_department_code.
 */
final class DepartmentService
{
    private const MAX_CODE_SUFFIX_ATTEMPTS = 100;

    public function __construct(
        private readonly DepartmentRepository $departments,
        private readonly DepartmentListCache $cache,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function generateCode(string $name): string
    {
        $code = substr(strtoupper(str_replace(' ', '_', trim($name))), 0, 50);

        return $code !== '' ? $code : 'DEPT';
    }

    /**
     * @throws \InvalidArgumentException if the name is blank or a unique
     *         code can't be generated within the retry limit
     */
    public function getOrCreateByName(string $name): Department
    {
        $cleanedName = trim($name);
        if ($cleanedName === '') {
            throw new \InvalidArgumentException('Department name must not be empty or whitespace-only.');
        }

        $existing = $this->departments->findOneByNameCaseInsensitive($cleanedName);
        if ($existing !== null) {
            return $existing;
        }

        $baseCode = $this->generateCode($cleanedName);
        $code = $baseCode;
        $suffix = 2;

        while ($this->departments->existsByCode($code)) {
            if ($suffix > self::MAX_CODE_SUFFIX_ATTEMPTS) {
                throw new \InvalidArgumentException(sprintf(
                    'Unable to generate a unique department code for "%s" after %d attempts.',
                    $cleanedName,
                    self::MAX_CODE_SUFFIX_ATTEMPTS,
                ));
            }
            $code = substr($baseCode, 0, 47).'_'.$suffix;
            ++$suffix;
        }

        $department = new Department($cleanedName, $code);

        try {
            $this->em->persist($department);
            $this->em->flush();
        } catch (\Throwable $exc) {
            // A concurrent request likely created the same department or
            // code — re-lookup by name; if still not found, propagate.
            $this->logger->info('Error creating department "{name}" — retrying lookup: {message}', [
                'name' => $cleanedName,
                'message' => $exc->getMessage(),
            ]);
            $this->em->clear();
            $existing = $this->departments->findOneByNameCaseInsensitive($cleanedName);
            if ($existing === null) {
                throw $exc;
            }

            return $existing;
        }

        $this->logger->info('Department auto-created: {name} ({code})', ['name' => $department->getName(), 'code' => $department->getCode()]);
        $this->cache->invalidate();

        return $department;
    }
}
