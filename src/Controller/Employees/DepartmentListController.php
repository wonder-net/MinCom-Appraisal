<?php

declare(strict_types=1);

namespace App\Controller\Employees;

use App\Entity\Department;
use App\Repository\DepartmentRepository;
use App\Service\DepartmentListCache;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of apps.employees.views.DepartmentListView: a bare (unpaginated)
 * {id, name} array for lookup/dropdown use, cache-aside for 1800s.
 */
#[IsGranted('IS_ADMIN')]
final class DepartmentListController
{
    public function __construct(
        private readonly DepartmentRepository $departments,
        private readonly DepartmentListCache $cache,
    ) {
    }

    #[Route('/api/v1/employees/departments/', name: 'employees_departments', methods: ['GET'])]
    public function __invoke(): JsonResponse
    {
        $cached = $this->cache->get();
        if ($cached !== null) {
            return new JsonResponse($cached);
        }

        $departments = array_map(
            static fn (Department $d) => ['id' => (string) $d->getId(), 'name' => $d->getName()],
            $this->departments->findAllOrderedByName(),
        );

        $this->cache->set($departments);

        return new JsonResponse($departments);
    }
}
