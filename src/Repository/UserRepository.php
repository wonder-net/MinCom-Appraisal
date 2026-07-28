<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\User;
use App\Enum\RoleName;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Security\Core\Exception\UnsupportedUserException;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\PasswordUpgraderInterface;

/**
 * @extends ServiceEntityRepository<User>
 */
class UserRepository extends ServiceEntityRepository implements PasswordUpgraderInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, User::class);
    }

    public function findOneByEmail(string $email): ?User
    {
        return $this->findOneBy(['email' => $email]);
    }

    /**
     * Port of `Role.objects.filter(name=...).values_list("users__id")`,
     * used to fan out multi-recipient notifications (e.g. every
     * HR_ADMIN on a dispute/sign-off event).
     *
     * @return list<User>
     */
    public function findAllByRole(RoleName $role): array
    {
        return $this->createQueryBuilder('u')
            ->innerJoin('u.assignedRoles', 'r')
            ->where('r.name = :role')
            ->setParameter('role', $role)
            ->getQuery()
            ->getResult();
    }

    /**
     * Case-insensitive lookup, mirroring Django's User.objects.get(email__iexact=...).
     */
    public function findOneByEmailCaseInsensitive(string $email): ?User
    {
        return $this->createQueryBuilder('u')
            ->where('LOWER(u.email) = LOWER(:email)')
            ->setParameter('email', $email)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Bulk-fetch which of the given emails already exist (case-insensitive),
     * mirroring the User.objects.filter(email__in=...) bulk check in
     * BulkImportValidator.validate().
     *
     * @param list<string> $emails
     * @return list<string>
     */
    public function findExistingEmailsCaseInsensitive(array $emails): array
    {
        if ($emails === []) {
            return [];
        }

        $result = $this->createQueryBuilder('u')
            ->select('u.email')
            ->where('LOWER(u.email) IN (:emails)')
            ->setParameter('emails', array_map(strtolower(...), $emails))
            ->getQuery()
            ->getScalarResult();

        return array_column($result, 'email');
    }

    /**
     * Port of AdminUserListCreateView's queryset: only users with at least
     * one role (excludes the "naked" bootstrap_superuser reserved for
     * /django-admin/), optionally filtered by email search, exact role, and
     * active status, ordered by email, page-number paginated.
     *
     * @return array{items: list<User>, count: int}
     */
    public function searchAdminUsers(?string $search, ?RoleName $role, ?bool $isActive, int $page, int $pageSize): array
    {
        $qb = $this->createQueryBuilder('u')
            ->where('SIZE(u.assignedRoles) > 0')
            ->orderBy('u.email', 'ASC');

        if ($search !== null && $search !== '') {
            $qb->andWhere('LOWER(u.email) LIKE :search')
                ->setParameter('search', '%'.strtolower($search).'%');
        }

        if ($role !== null) {
            $qb->join('u.assignedRoles', 'r')
                ->andWhere('r.name = :role')
                ->setParameter('role', $role);
        }

        if ($isActive !== null) {
            $qb->andWhere('u.isActive = :isActive')
                ->setParameter('isActive', $isActive);
        }

        $countQb = (clone $qb)->select('COUNT(DISTINCT u.id)')->resetDQLPart('orderBy');
        $count = (int) $countQb->getQuery()->getSingleScalarResult();

        $items = $qb->distinct()
            ->setFirstResult(($page - 1) * $pageSize)
            ->setMaxResults($pageSize)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'count' => $count];
    }

    public function upgradePassword(PasswordAuthenticatedUserInterface $user, string $newHashedPassword): void
    {
        if (!$user instanceof User) {
            throw new UnsupportedUserException(sprintf('Instances of "%s" are not supported.', $user::class));
        }

        $user->setPassword($newHashedPassword);
        $this->getEntityManager()->flush();
    }
}
